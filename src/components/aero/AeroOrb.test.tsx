import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AeroOrb } from '@/components/aero/AeroOrb'
import { Mood } from '@/generated/prisma/enums'

describe('AeroOrb', () => {
  it('applies the correct orb variant class for each mood', () => {
    const { container } = render(<AeroOrb mood={Mood.RAD} />)
    expect(container.querySelector('.aero-orb')).toHaveClass('orb-rad')
  })

  it('shows the mood emoji on full-size orbs', () => {
    render(<AeroOrb mood={Mood.AWFUL} />)
    expect(screen.getByLabelText('Mood: AWFUL')).toHaveTextContent('😭')
  })

  it('renders mini orbs without an emoji', () => {
    const { container } = render(<AeroOrb mood={Mood.MEH} mini />)
    const orb = container.querySelector('.mini-orb')
    expect(orb).not.toBeNull()
    expect(orb).toHaveTextContent('')
  })
})