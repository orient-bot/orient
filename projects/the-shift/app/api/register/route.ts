import { NextRequest, NextResponse } from 'next/server'
import { registrationSchema } from '@/lib/validation'
import { createRegistration, isEmailRegistered } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const result = registrationSchema.safeParse(body)
    if (!result.success) {
      const firstError = result.error.errors[0]
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      )
    }

    const data = result.data

    // Check for duplicate email
    const emailExists = await isEmailRegistered(data.email)
    if (emailExists) {
      return NextResponse.json(
        { error: 'כתובת האימייל הזו כבר רשומה' },
        { status: 409 }
      )
    }

    // Create registration
    const registration = await createRegistration({
      name: data.name,
      email: data.email,
      company: data.company || undefined,
      linkedin: data.linkedin || undefined,
      twitter: data.twitter || undefined,
      kolCode: data.kolCode || undefined,
    })

    return NextResponse.json(
      { success: true, id: registration.id },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'אירעה שגיאה בשרת' },
      { status: 500 }
    )
  }
}
