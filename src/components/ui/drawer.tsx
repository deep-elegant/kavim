import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"
import { UnfoldHorizontal, UnfoldVertical } from "lucide-react"

import { cn } from "@/utils/tailwind"

import { useDrawerPreferences } from "./useDrawerPreferences"

type DrawerSide = "bottom" | "right" | "left" | "top"

type DrawerRootProps = React.ComponentProps<typeof DrawerPrimitive.Root>

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: DrawerRootProps) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
)
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...props}
  />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

export type DrawerContentProps = React.ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Content
> & {
  side?: DrawerSide
  showHandle?: boolean
  adjustable?: boolean
  drawerId?: string
  defaultSize?: number
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  DrawerContentProps
>(
  (
    {
      className,
      children,
      side = "bottom",
      showHandle,
      adjustable = false,
      drawerId,
      defaultSize = 896,
      style,
      ...props
    },
    ref,
  ) => {
    const isHorizontal = side === "left" || side === "right"
    const shouldShowHandle = showHandle ?? (!adjustable && side === "bottom")
    const dragHandlers = React.useRef<{ move?: (event: MouseEvent) => void; up?: () => void }>({})

    const { sizes, setSize: persistSize } = useDrawerPreferences()
    const persistedSize = drawerId ? sizes[drawerId] : undefined
    const [size, setSize] = React.useState(() => persistedSize ?? defaultSize)
    const previousDrawerId = React.useRef<string | undefined>(drawerId)
    const lastSyncedSizeRef = React.useRef<number | undefined>(
      typeof persistedSize === "number" ? persistedSize : undefined,
    )

    React.useEffect(() => {
      if (!drawerId) {
        lastSyncedSizeRef.current = undefined
        return
      }

      if (typeof persistedSize !== "number") {
        if (lastSyncedSizeRef.current !== undefined && size !== defaultSize) {
          setSize(defaultSize)
        }
        lastSyncedSizeRef.current = undefined
        return
      }

      if (lastSyncedSizeRef.current === persistedSize) {
        return
      }

      lastSyncedSizeRef.current = persistedSize
      setSize(persistedSize)
    }, [defaultSize, drawerId, persistedSize, size])

    React.useEffect(() => {
      if (drawerId === previousDrawerId.current) {
        return
      }

      previousDrawerId.current = drawerId

      if (!drawerId) {
        setSize(defaultSize)
        lastSyncedSizeRef.current = undefined
        return
      }

      if (typeof persistedSize === "number") {
        setSize(persistedSize)
        lastSyncedSizeRef.current = persistedSize
      } else {
        setSize(defaultSize)
        lastSyncedSizeRef.current = undefined
      }
    }, [drawerId, defaultSize, persistedSize])

    React.useEffect(() => {
      if (!adjustable || !drawerId) {
        return
      }

      if (lastSyncedSizeRef.current === size) {
        return
      }

      lastSyncedSizeRef.current = size
      persistSize(drawerId, size)
    }, [adjustable, drawerId, persistSize, size])

    React.useEffect(() => () => {
      if (dragHandlers.current.move) {
        document.removeEventListener("mousemove", dragHandlers.current.move)
      }
      if (dragHandlers.current.up) {
        document.removeEventListener("mouseup", dragHandlers.current.up)
      }
    }, [])

    const handleMouseDown = React.useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault()
        const startPos = isHorizontal ? event.clientX : event.clientY
        const startSize = size

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY
          let newSize = startSize

          if (side === "right") {
            newSize = startSize + (startPos - currentPos)
          } else if (side === "left") {
            newSize = startSize - (startPos - currentPos)
          } else if (side === "bottom") {
            newSize = startSize + (startPos - currentPos)
          } else {
            newSize = startSize - (startPos - currentPos)
          }

          const minSize = 440
          const maxSize = isHorizontal
            ? Math.max(minSize, window.innerWidth * 0.9)
            : Math.max(minSize, window.innerHeight * 0.9)

          const clampedSize = Math.min(Math.max(newSize, minSize), maxSize)
          if (clampedSize !== size) {
            setSize(clampedSize)
          }
        }

        const handleMouseUp = () => {
          if (dragHandlers.current.move) {
            document.removeEventListener("mousemove", dragHandlers.current.move)
          }
          if (dragHandlers.current.up) {
            document.removeEventListener("mouseup", dragHandlers.current.up)
          }
          dragHandlers.current = {}
        }

        dragHandlers.current = { move: handleMouseMove, up: handleMouseUp }

        document.addEventListener("mousemove", handleMouseMove)
        document.addEventListener("mouseup", handleMouseUp)
      },
      [isHorizontal, side, size],
    )

    return (
      <DrawerPortal data-slot="drawer-portal">
        <DrawerOverlay />
        <DrawerPrimitive.Content
          ref={ref}
          data-slot="drawer-content"
          data-side={side}
          style={{
            ...(adjustable
              ? {
                  width: isHorizontal ? size : undefined,
                  height: !isHorizontal ? size : undefined,
                  maxWidth: isHorizontal ? "90vw" : undefined,
                  maxHeight: !isHorizontal ? "90vh" : undefined,
                }
              : {}),
            ...style,
          }}
          className={cn(
            "group/drawer-content fixed z-50 flex flex-col bg-background shadow-lg transition-transform duration-300",
            side === "bottom" &&
              "inset-x-0 bottom-0 mt-24 w-full rounded-t-[10px] border-t data-[state=closed]:translate-y-full data-[state=open]:translate-y-0",
            side === "top" &&
              "inset-x-0 top-0 mb-24 w-full rounded-b-[10px] border-b data-[state=closed]:-translate-y-full data-[state=open]:translate-y-0",
            side === "right" &&
              "inset-y-0 right-0 h-full border-l data-[state=closed]:translate-x-full data-[state=open]:translate-x-0",
            side === "left" &&
              "inset-y-0 left-0 h-full border-r data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0",
            className,
          )}
          {...props}
        >
          {adjustable ? (
            <>
              <div
                onMouseDown={handleMouseDown}
                className={cn(
                  "absolute z-10",
                  isHorizontal && "top-0 h-full w-2 cursor-col-resize",
                  side === "right" && "-left-1",
                  side === "left" && "-right-1",
                  !isHorizontal && "left-0 h-2 w-full cursor-row-resize",
                  side === "bottom" && "-top-1",
                  side === "top" && "-bottom-1",
                )}
              >
                <div
                  className={cn(
                    "bg-transparent transition-colors duration-200 group-hover/drawer-content:bg-primary",
                    isHorizontal ? "mx-auto h-full w-px" : "my-auto h-px w-full",
                  )}
                />
              </div>
              <div
                className={cn(
                  "pointer-events-none absolute",
                  isHorizontal && "top-1/2 -translate-y-1/2",
                  side === "right" && "-left-3",
                  side === "left" && "-right-3",
                  !isHorizontal && "left-1/2 -translate-x-1/2",
                  side === "bottom" && "-top-3",
                  side === "top" && "-bottom-3",
                )}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm">
                  {isHorizontal ? (
                    <UnfoldHorizontal className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <UnfoldVertical className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </div>
            </>
          ) : null}
          {shouldShowHandle ? (
            <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
          ) : null}
          {children}
        </DrawerPrimitive.Content>
      </DrawerPortal>
    )
  },
)
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)} {...props} />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
