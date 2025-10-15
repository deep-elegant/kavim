'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/utils/tailwind'
import { Paintbrush } from 'lucide-react'
import { useCallback } from 'react'

export type ColorStyle = {
  background: string
  border: string
  text: string
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || hex.startsWith('oklch')) {
    return null
  }
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

function getCorrectTextColor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#000000'
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}

function darkenColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex

  const darken = (color: number) =>
    Math.max(0, color - Math.round(255 * amount))

  const r = darken(rgb.r)
  const g = darken(rgb.g)
  const b = darken(rgb.b)

  const toHex = (c: number) => ('0' + c.toString(16)).slice(-2)

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function SimpleColorPicker({
  color,
  setColor,
  className,
}: {
  color: ColorStyle
  setColor: (color: ColorStyle) => void
  className?: string
}) {
  const solids = [
    '#E2E2E2',
    '#ff75c3',
    '#ffa647',
    '#ffe83f',
    '#9fff5b',
    '#70e2ff',
    '#cd93ff',
    '#09203f',
    '#FF0000',
    '#0000FF',
  ]

  const handleColorChange = useCallback(
    (newBg: string) => {
      const newBorder = darkenColor(newBg, 0.1)
      const newText = getCorrectTextColor(newBg)
      setColor({
        background: newBg,
        border: newBorder,
        text: newText,
      })
    },
    [setColor],
  )

  const background = color.background

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'justify-start text-left font-normal',
            !background && 'text-muted-foreground',
            className,
          )}
        >
          <div className="w-full flex items-center gap-2">
            {background ? (
              <div
                className="h-4 w-4 rounded !bg-center !bg-cover transition-all"
                style={{ background }}
              ></div>
            ) : (
              <Paintbrush className="h-4 w-4" />
            )}
            <div className="truncate flex-1">
              {background ? background : 'Pick a color'}
            </div>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="flex flex-wrap gap-1 mt-0">
          {solids.map((s) => (
            <div
              key={s}
              style={{ background: s }}
              className="rounded-md h-6 w-6 cursor-pointer active:scale-105"
              onClick={() => handleColorChange(s)}
            />
          ))}
        </div>
        <Input
          value={background}
          onChange={(e) => handleColorChange(e.target.value)}
          className="mt-4"
          placeholder="e.g. #FFFFFF or oklch(0.5 0.2 250)"
        />
      </PopoverContent>
    </Popover>
  )
}
