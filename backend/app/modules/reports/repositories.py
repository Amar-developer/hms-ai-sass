from sqlmodel import Session, select

from app.modules.reports.models import MonthlyRevenueSnapshot, ReportJob


class ReportJobRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, job: ReportJob) -> ReportJob:
        self.session.add(job)
        return job

    def get_for_tenant(self, tenant_id: str, job_id: str) -> ReportJob | None:
        job = self.session.get(ReportJob, job_id)
        if not job or job.tenant_id != tenant_id:
            return None
        return job

    def list_for_tenant(self, *, tenant_id: str, limit: int) -> list[ReportJob]:
        return list(
            self.session.exec(
                select(ReportJob)
                .where(ReportJob.tenant_id == tenant_id)
                .order_by(ReportJob.created_at.desc())
                .limit(limit)
            ).all()
        )


class MonthlyRevenueSnapshotRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_for_tenant(
        self, tenant_id: str, snapshot_id: str
    ) -> MonthlyRevenueSnapshot | None:
        snapshot = self.session.get(MonthlyRevenueSnapshot, snapshot_id)
        if not snapshot or snapshot.tenant_id != tenant_id:
            return None
        return snapshot

    def list_for_tenant(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        limit: int,
    ) -> list[MonthlyRevenueSnapshot]:
        return list(
            self.session.exec(
                select(MonthlyRevenueSnapshot)
                .where(
                    MonthlyRevenueSnapshot.tenant_id == tenant_id,
                    MonthlyRevenueSnapshot.branch_id == branch_id,
                )
                .order_by(
                    MonthlyRevenueSnapshot.period_year.desc(),
                    MonthlyRevenueSnapshot.period_month.desc(),
                )
                .limit(limit)
            ).all()
        )
