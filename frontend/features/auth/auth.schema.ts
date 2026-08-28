import {z} from 'zod'
import { passwordSchema } from '../../app/validations/common'

export const authSchema = z.object({
    identifier: z.string().trim().min(3, "Enter your username or email"),
    password:passwordSchema
})

export type AuthFormValues = z.infer<typeof authSchema>
