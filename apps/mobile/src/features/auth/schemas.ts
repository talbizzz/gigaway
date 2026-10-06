import { z } from 'zod'

import { DISCIPLINES } from '@/features/profile/use-profile'

const disciplineValues = DISCIPLINES.map((d) => d.value) as [string, ...string[]]

export const SignInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

export type SignInValues = z.infer<typeof SignInSchema>

export const SignUpSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, 'Enter your first name.')
      .max(40, 'That name is too long.'),
    lastName: z
      .string()
      .trim()
      .min(1, 'Enter your family name.')
      .max(40, 'That name is too long.'),
    discipline: z.enum(disciplineValues, {
      errorMap: () => ({ message: 'Choose the closest match.' }),
    }),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
    // Supabase enforces a minimum of 6; 10 is a reasonable floor for an app that
    // reveals home addresses.
    password: z.string().min(10, 'Use at least 10 characters.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match.",
    path: ['confirmPassword'],
  })

export type SignUpValues = z.infer<typeof SignUpSchema>

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
})

export type ForgotPasswordValues = z.infer<typeof ForgotPasswordSchema>

export const SetNewPasswordSchema = z
  .object({
    // Same floor as sign-up — an app that reveals home addresses deserves more
    // than Supabase's own minimum of 6.
    password: z.string().min(10, 'Use at least 10 characters.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match.",
    path: ['confirmPassword'],
  })

export type SetNewPasswordValues = z.infer<typeof SetNewPasswordSchema>
