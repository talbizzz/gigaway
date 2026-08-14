import { z } from 'zod'

import { DISCIPLINES } from '@/features/profile/use-profile'

const disciplineValues = DISCIPLINES.map((d) => d.value) as [string, ...string[]]

export const SignInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

export type SignInValues = z.infer<typeof SignInSchema>

export const SignUpSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Please enter your name as colleagues would know it.')
    .max(80, 'That name is too long.'),
  discipline: z.enum(disciplineValues, {
    errorMap: () => ({ message: 'Choose the closest match.' }),
  }),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  // Supabase enforces a minimum of 6; 10 is a reasonable floor for an app that
  // reveals home addresses.
  password: z.string().min(10, 'Use at least 10 characters.'),
})

export type SignUpValues = z.infer<typeof SignUpSchema>
