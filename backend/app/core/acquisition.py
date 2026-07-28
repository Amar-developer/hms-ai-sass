from enum import Enum


class AcquisitionSource(str, Enum):
    DIRECT = "direct"
    REFERRAL = "referral"
    GOOGLE = "google"
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"
    WEBSITE = "website"
    WHATSAPP = "whatsapp"
    ADS = "ads"
    CAMPAIGN = "campaign"
    OTHER = "other"
