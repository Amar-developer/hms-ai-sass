import { z } from "zod";
import { ValidationMessages } from "@/utils/constants";

export const emailSchema = z
  .string()
  .trim()
  .min(1, ValidationMessages.required)
  .email(ValidationMessages.email);

export const passwordSchema = z
  .string()
  .trim()
  .min(1, ValidationMessages.passwordRequired)
  .min(8, ValidationMessages.passwordMin);

export const mobileSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{10}$/, "Mobile number must be 10 digits");

export const requiredString = (message = "This field is required") =>
  z.string().trim().min(1, message);
