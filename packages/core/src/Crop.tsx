import { useImmutableRef } from "@callcc/toolkit-js/react/useImmutableRef";
import { useMutableRef } from "@callcc/toolkit-js/react/useMutableRef";
import { useRefCallback } from "@callcc/toolkit-js/react/useRefCallback";
import { throttle } from "@callcc/toolkit-js/throttle";
import type { CSSProperties, PropsWithChildren } from "react";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  createContext,
  useContext,
} from "react";

import type { DataBox } from "./NestedBox";
import { NestedBox } from "./NestedBox";
import type { IDirection } from "./types";

const addEventListener = document.addEventListener;
const removeEventListener = document.removeEventListener;

class Movement {
  lastPageX: number = 0;
  lastPageY: number = 0;

  onStart(pageX: number, pageY: number) {
    this.lastPageX = pageX;
    this.lastPageY = pageY;
  }

  onMove(pageX: number, pageY: number) {
    const dx = pageX - this.lastPageX;
    const dy = pageY - this.lastPageY;
    this.lastPageX = pageX;
    this.lastPageY = pageY;
    return { dx, dy };
  }
}

class Subscribable<T> {
  private listeners_: Set<(value: T) => void> = new Set();

  subscribe(listener: (value: T) => void) {
    this.listeners_.add(listener);
    return () => {
      this.listeners_.delete(listener);
    };
  }

  notify(value: T) {
    for (const listener of this.listeners_) {
      listener(value);
    }
  }
}

type ICropContext = {
  onDragStart?: (
    target: IDirection | "area",
    pageX: number,
    pageY: number,
  ) => void;
  dataBox$: Subscribable<DataBox>;
};
const CropContext = createContext<ICropContext>({
  dataBox$: new Subscribable(),
});

const useCropContext = () => useContext(CropContext);

export function CropHandle(props: {
  className?: string;
  style?: CSSProperties;
  dir: IDirection;
}) {
  const ctx = useCropContext();
  const dir = props.dir;

  return (
    <div
      className={props.className}
      data-handle-dir={dir}
      style={props.style}
      onMouseDown={(evt) => {
        evt.stopPropagation();
        ctx.onDragStart?.(dir, evt.pageX, evt.pageY);
      }}
      onTouchStart={(evt) => {
        if (evt.touches.length === 1) {
          ctx.onDragStart?.(dir, evt.touches[0].pageX, evt.touches[0].pageY);
        }
      }}
    />
  );
}

export type ICropProps = PropsWithChildren<{
  style?: CSSProperties;
  className?: string;
  minHeight?: number;
  minWidth?: number;
  /**
   * It's your responsibility to make sure the callback is stable.
   * @param target
   */
  onStart?: (target?: IDirection | "area") => void;
  /**
   * It's your responsibility to make sure the callback is stable.
   * @param rect
   */
  onDrag?: (rect: DOMRectReadOnly) => void;
  /**
   * It's your responsibility to make sure the callback is stable.
   * @param rect
   */
  onEnd?: (rect: DOMRectReadOnly) => void;
  /**
   * Size and position of inner box in the outer box.
   */
  initialRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
    unit?: "px" | "%";
  };
}>;

export function Crop(props: ICropProps) {
  const {
    minWidth,
    minHeight,
    initialRect,
    onStart: onStartProp,
    onDrag: onDragProp,
    onEnd: onEndProp,
  } = props;

  const dataBox$Ref = useImmutableRef(() => new Subscribable<DataBox>());
  const nBoxRef = useMutableRef(() => {
    return new NestedBox(0, 0, 0, 0, 0, 0);
  });
  const movementRef = useImmutableRef(() => new Movement());
  const targetRef = useRef<"" | "area" | IDirection>("");

  const contentBoxRef = useRefCallback(
    (element: Element) => {
      const observer = new ResizeObserver((entries) => {
        const rect = entries[0].target.getBoundingClientRect();
        const rectPrev = nBoxRef.current.outer;
        if (!rectPrev.equal(rect)) {
          nBoxRef.current = new NestedBox(
            rect.left,
            rect.top,
            rect.right,
            rect.bottom,
            minWidth,
            minHeight,
            initialRect,
          );
          if (initialRect) {
            dataBox$Ref.current.notify(nBoxRef.current.toDataBox());
          }
        }
      });

      observer.observe(element, { box: "border-box" });
      return () => observer.unobserve(element);
    },
    [minHeight, minWidth],
  );

  useLayoutEffect(() => {
    let moved = false;
    let rAFId: number;

    const notify = throttle(
      (box: DataBox) => {
        dataBox$Ref.current.notify(box);
      },
      0,
      {
        scheduler(fn) {
          rAFId = requestAnimationFrame(fn);
          return () => cancelAnimationFrame(rAFId);
        },
      },
    );

    const handleMove = (pageX: number, pageY: number) => {
      if (!targetRef.current) {
        return;
      }

      const movement = movementRef.current;
      const nBox = nBoxRef.current;
      const { dx, dy } = movementRef.current.onMove(pageX, pageY);
      if (targetRef.current !== "area") {
        if (targetRef.current.includes("left")) {
          nBox.moveLeftLine(movement.lastPageX);
        }
        if (targetRef.current.includes("right")) {
          nBox.moveRightLine(movement.lastPageX);
        }
        if (targetRef.current.includes("top")) {
          nBox.moveTopLine(movement.lastPageY);
        }
        if (targetRef.current.includes("bottom")) {
          nBox.moveBottomLine(movement.lastPageY);
        }
      } else {
        nBox.moveX(dx);
        nBox.moveY(dy);
      }

      if (!moved) {
        moved = true;
        onStartProp?.(targetRef.current);
      }

      if (onDragProp) {
        const { inner, outer } = nBoxRef.current;
        onDragProp(
          new DOMRectReadOnly(
            inner.left - outer.left,
            inner.top - outer.top,
            inner.width,
            inner.height,
          ),
        );
        notify(nBox.toDataBox());
      }
    };

    const handleUp = () => {
      if (moved) {
        if (onEndProp && nBoxRef.current) {
          const { inner, outer } = nBoxRef.current;
          onEndProp(
            new DOMRectReadOnly(
              inner.left - outer.left,
              inner.top - outer.top,
              inner.width,
              inner.height,
            ),
          );
        }
      }
      moved = false;
      targetRef.current = "";
    };

    const mouseMoveListener = (evt: MouseEvent) => {
      handleMove(evt.pageX, evt.pageY);
    };

    const touchMoveListener = (evt: TouchEvent) => {
      if (evt.touches.length === 1) {
        evt.preventDefault(); // Prevent scrolling.
        handleMove(evt.touches[0].pageX, evt.touches[0].pageY);
      }
    };

    const touchStartListener = (evt: TouchEvent) => {
      if (evt.touches.length > 1) {
        // Stop if there are multiple touches.
        handleUp();
      }
    };

    addEventListener("mousemove", mouseMoveListener);
    addEventListener("mouseup", handleUp);
    addEventListener("touchmove", touchMoveListener, {
      passive: false,
    });
    addEventListener("touchend", handleUp);
    addEventListener("touchcancel", handleUp);
    addEventListener("touchstart", touchStartListener);

    return () => {
      removeEventListener("mouseup", handleUp);
      removeEventListener("touchmove", touchMoveListener);
      removeEventListener("touchend", handleUp);
      removeEventListener("touchcancel", handleUp);
      removeEventListener("touchstart", touchStartListener);
      rAFId && cancelAnimationFrame(rAFId);
    };
  }, []);

  const ctx = useMemo(() => {
    return {
      dataBox$: dataBox$Ref.current,
      onDragStart: (target, pageX, pageY) => {
        if (!targetRef.current) {
          // TODO: bind mousemove or touchmove
          targetRef.current = target;
          movementRef.current.onStart(pageX, pageY);
        }
      },
    } satisfies ICropContext;
  }, [dataBox$Ref, movementRef]);

  return (
    <div ref={contentBoxRef} className={props.className} style={props.style}>
      <CropContext.Provider value={ctx}>{props.children}</CropContext.Provider>
    </div>
  );
}

export function CropMask(props: {
  fill?: string;
  fillOpacity?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ctx = useCropContext();
  const id = useId();
  const maskRectRef = useRef<SVGRectElement>(null);

  useLayoutEffect(() => {
    return ctx.dataBox$.subscribe(({ outer, inner }) => {
      const maskRect = maskRectRef.current;
      if (maskRect) {
        maskRect.setAttribute("x", inner.left - outer.left + "px");
        maskRect.setAttribute("y", inner.top - outer.top + "px");
        maskRect.setAttribute("width", inner.width + "px");
        maskRect.setAttribute("height", inner.height + "px");
      }
    });
  }, [ctx.dataBox$]);

  return (
    <svg
      className={props.className}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
      }}
    >
      <defs>
        <mask id={id}>
          <rect width="100%" height="100%" fill="white" />
          <rect
            ref={maskRectRef}
            x={0}
            y={0}
            width="100%"
            height="100%"
            fill="black"
          />
        </mask>
      </defs>
      <rect
        fill={props.fill}
        fillOpacity={props.fillOpacity ?? 0.5}
        width="100%"
        height="100%"
        mask={`url(#${id})`}
      />
    </svg>
  );
}

export function CropArea(
  props: PropsWithChildren<{
    fill?: string;
    fillOpacity?: number;
    className?: string;
    style?: CSSProperties;
  }>,
) {
  const ctx = useCropContext();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    return ctx.dataBox$.subscribe(({ outer, inner }) => {
      const element = ref.current;
      if (element) {
        element.style.left = inner.left - outer.left + "px";
        element.style.top = inner.top - outer.top + "px";
        element.style.right = outer.right - inner.right + "px";
        element.style.bottom = outer.bottom - inner.bottom + "px";
      }
    });
  }, [ctx.dataBox$]);

  return (
    <div
      ref={ref}
      className={props.className}
      style={props.style}
      onMouseDown={(evt) => {
        ctx.onDragStart?.("area", evt.pageX, evt.pageY);
      }}
      onTouchStart={(evt) => {
        if (evt.touches.length === 1) {
          ctx.onDragStart?.("area", evt.touches[0].pageX, evt.touches[0].pageY);
        }
      }}
    >
      {props.children}
    </div>
  );
}
