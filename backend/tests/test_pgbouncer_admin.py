from scripts.pgbouncer_admin import (
    EXPECTED_CONFIG,
    _admin_command,
    config_issues,
    parse_csv_rows,
    parse_show_config,
    summarize_samples,
)


SHOW_CONFIG_CSV = """key,value,default,changeable
pool_mode,transaction,session,yes
default_pool_size,20,20,yes
query_wait_timeout,10,120,yes
reserve_pool_size,5,0,yes
reserve_pool_timeout,3,5,yes
"""

SHOW_POOLS_CSV = """database,user,cl_active,cl_waiting,sv_active,sv_idle,maxwait,maxwait_us,pool_mode
medizinhub_hms,medizinhub,20,7,20,0,4.5,500000,transaction
pgbouncer,medizinhub,1,0,0,0,0,0,statement
"""

SHOW_STATS_CSV = """database,total_xact_count,total_query_count,total_wait_time
medizinhub_hms,1000,4000,250000
"""


def test_parse_show_config_maps_keys_to_values():
    config = parse_show_config(SHOW_CONFIG_CSV)

    assert config["query_wait_timeout"] == "10"
    assert config["reserve_pool_size"] == "5"
    assert config["pool_mode"] == "transaction"


def test_config_issues_is_empty_when_the_pooler_matches():
    assert config_issues(parse_show_config(SHOW_CONFIG_CSV), EXPECTED_CONFIG) == []


def test_config_issues_flags_a_stale_container_still_on_the_default():
    """A container started before the compose change keeps PgBouncer's 120s
    default, which is exactly the condition that disables the API's 503
    load-shedding path."""
    stale = parse_show_config(
        SHOW_CONFIG_CSV.replace("query_wait_timeout,10", "query_wait_timeout,120")
    )

    issues = config_issues(stale, EXPECTED_CONFIG)

    assert len(issues) == 1
    assert "query_wait_timeout is '120', expected '10'" in issues[0]


def test_config_issues_explains_an_unsupported_setting():
    unsupported = parse_show_config(SHOW_CONFIG_CSV)
    del unsupported["query_wait_timeout"]

    issues = config_issues(unsupported, EXPECTED_CONFIG)

    assert "does not recognise the setting" in issues[0]
    assert "pgbouncer.ini" in issues[0]


def test_parse_csv_rows_reads_columns_by_name():
    rows = parse_csv_rows(SHOW_POOLS_CSV)

    assert len(rows) == 2
    assert rows[0]["cl_waiting"] == "7"
    assert rows[0]["sv_active"] == "20"


def test_summarize_samples_reports_pool_contention():
    samples = [
        {
            "pools": parse_csv_rows(SHOW_POOLS_CSV),
            "stats": parse_csv_rows(SHOW_STATS_CSV),
        },
        {
            "pools": parse_csv_rows(SHOW_POOLS_CSV),
            "stats": parse_csv_rows(SHOW_STATS_CSV.replace(",250000", ",900000")),
        },
    ]

    summary = summarize_samples(samples)

    assert summary["peak_clients_waiting"] == 7
    assert summary["peak_max_wait_seconds"] == 4.5
    assert summary["peak_server_connections_active"] == 20
    assert summary["total_wait_time_us_delta"] == 650000
    assert summary["pool_was_the_constraint"] is True


def test_summarize_samples_reports_an_idle_pool_as_not_the_constraint():
    idle = SHOW_POOLS_CSV.replace(",20,7,20,0,4.5,500000,", ",3,0,3,17,0,0,")
    summary = summarize_samples(
        [{"pools": parse_csv_rows(idle), "stats": parse_csv_rows(SHOW_STATS_CSV)}]
    )

    assert summary["peak_clients_waiting"] == 0
    assert summary["pool_was_the_constraint"] is False


def test_summarize_samples_handles_an_empty_run():
    summary = summarize_samples([])

    assert summary["samples"] == 0
    assert summary["pool_was_the_constraint"] is False


def test_admin_command_never_puts_credentials_in_arguments():
    """The password must be dereferenced inside the container, not passed in,
    so it cannot reach shell history or another user's process listing."""
    command = _admin_command(
        "SHOW POOLS",
        compose_command="sudo docker compose",
        compose_file="docker-compose.staging.yml",
        service="pgbouncer",
    )

    assert command[:2] == ["sudo", "docker"]
    assert "docker-compose.staging.yml" in command
    assert command[-3:-1] == ["sh", "-c"]
    assert '"$DB_PASSWORD"' in command[-1]
    assert "-d pgbouncer" in command[-1]
    assert not any("PGPASSWORD=" in part for part in command[:-1])


def test_holder_command_runs_detached_without_credentials_in_arguments():
    from scripts.pgbouncer_admin import _holder_command

    command = _holder_command(
        compose_command="sudo docker compose",
        compose_file="docker-compose.yml",
        service="pgbouncer",
        holders=30,
        hold_seconds=45,
    )

    # Detached, so the caller can probe the API while connections are held.
    assert "-d" in command
    assert "seq 1 30" in command[-1]
    assert "pg_sleep(45)" in command[-1]
    assert not any("PGPASSWORD=" in part for part in command[:-1])


def test_probe_http_reports_a_failure_instead_of_raising():
    """The probe runs mid-saturation; an unreachable API is a result to
    report, not an exception that discards the whole run."""
    from scripts.pgbouncer_admin import probe_http

    result = probe_http(
        "http://127.0.0.1:59999/unreachable", payload=None, timeout_seconds=2
    )

    assert result["status"] is None
    assert "Error" in result["body"] or "error" in result["body"]
