from pydantic import BaseModel


def apply_update_fields(
    model: object,
    payload: BaseModel,
    *,
    exclude: set[str] | None = None,
) -> object:
    data = payload.model_dump(exclude_unset=True)
    for key in exclude or set():
        data.pop(key, None)
    for key, value in data.items():
        setattr(model, key, value)
    return model
