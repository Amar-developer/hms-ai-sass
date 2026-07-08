import {z} from 'zod'
import { emailSchema, passwordSchema } from './common'

export const authSchema = z.object({
    email:emailSchema,
    password:passwordSchema
})

export type AuthFormValues = z.infer<typeof authSchema>
