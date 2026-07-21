import {z} from 'zod'
import { emailSchema, passwordSchema } from '../../app/validations/common'

export const authSchema = z.object({
    email:emailSchema,
    password:passwordSchema
})

export type AuthFormValues = z.infer<typeof authSchema>
