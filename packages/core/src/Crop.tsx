import { useImmutableRef } from "@callcc/toolkit-js/react/useImmutableRef";
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

const addEventListener = document.addEventListener.bind(document);
const removeEventListener = document.removeEventListener.bind(document);

class Movement {
  private lastPageX_ = 0;
  private lastPageY_ = 0;
  /**
   * Set to non-empty when starting dragging.
   */
  target: IDirection | "area" | "" = "";
  nBox = new NestedBox(0, 0, 0, 0);
  private moved_ = false;
  events$ = new Subscribable<
    | {
        topic: "start";
        payload: IDirection | "area";
      }
    | {
        topic: "move" | "end";
        payload: DataBox;
      }
  >();

  onStart(
    type: "mouse" | "touch",
    target: IDirection | "area",
    pageX: number,
    pageY: number,
  ) {
    // Already started.
    if (this.target) return;

    this.target = target;
    this.lastPageX_ = pageX;
    this.lastPageY_ = pageY;

    if (type === "mouse") {
      const mousemove = (evt: MouseEvent) => {
        if (!this.target) return;

        this.onMove(this.target, evt.pageX, evt.pageY);
      };
      const mouseup = () => {
        if (!this.target) return;

        removeEventListener("mousemove", mousemove);
        removeEventListener("mouseup", mouseup);
        this.onEnd();
      };

      addEventListener("mousemove", mousemove);
      addEventListener("mouseup", mouseup);
    } else if (type === "touch") {
      const touchend = () => {
        if (!this.target) return;

        removeEventListener("touchstart", touchstart);
        removeEventListener("touchmove", touchmove);
        removeEventListener("touchend", touchend);
        removeEventListener("touchcancel", touchend);
        this.onEnd();
      };
      const touchstart = (evt: TouchEvent) => {
        // Cancel if there are multiple touches.
        if (evt.touches.length > 1 && this.target) {
          touchend();
        }
      };
      const touchmove = (evt: TouchEvent) => {
        if (evt.touches.length === 1 && this.target) {
          this.onMove(this.target, evt.touches[0].pageX, evt.touches[0].pageY);
        }
      };

      addEventListener("touchstart", touchstart);
      addEventListener("touchmove", touchmove);
      addEventListener("touchend", touchend);
      addEventListener("touchcancel", touchend);
    }
  }

  private onMove(target: "area" | IDirection, pageX: number, pageY: number) {
    const nBox = this.nBox;

    const dx = pageX - this.lastPageX_;
    const dy = pageY - this.lastPageY_;
    this.lastPageX_ = pageX;
    this.lastPageY_ = pageY;
    if (target !== "area") {
      if (target.includes("left")) {
        nBox.moveLeftLine(pageX);
      }
      if (target.includes("right")) {
        nBox.moveRightLine(pageX);
      }
      if (target.includes("top")) {
        nBox.moveTopLine(pageY);
      }
      if (target.includes("bottom")) {
        nBox.moveBottomLine(pageY);
      }
    } else {
      nBox.moveX(dx);
      nBox.moveY(dy);
    }

    if (!this.moved_) {
      this.moved_ = true;
      this.events$.notify({ topic: "start", payload: target });
    }

    this.events$.notify({ topic: "move", payload: this.nBox.toDataBox() });
  }

  private onEnd() {
    if (this.moved_) {
      this.events$.notify({ topic: "end", payload: this.nBox.toDataBox() });
    }

    this.moved_ = false;
    this.target = "";
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
    type: "mouse" | "touch",
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
        ctx.onDragStart?.("mouse", dir, evt.pageX, evt.pageY);
      }}
      onTouchStart={(evt) => {
        if (evt.touches.length === 1) {
          ctx.onDragStart?.(
            "touch",
            dir,
            evt.touches[0].pageX,
            evt.touches[0].pageY,
          );
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
  const movementRef = useImmutableRef(() => new Movement());

  const contentBoxRef = useRefCallback(
    (element: Element) => {
      const observer = new ResizeObserver((entries) => {
        const rect = entries[0].target.getBoundingClientRect();
        const rectPrev = movementRef.current.nBox.outer;
        if (!rectPrev.equal(rect)) {
          movementRef.current.nBox = new NestedBox(
            rect.left,
            rect.top,
            rect.right,
            rect.bottom,
            minWidth,
            minHeight,
            initialRect,
          );
          if (initialRect) {
            dataBox$Ref.current.notify(movementRef.current.nBox.toDataBox());
          }
        }
      });

      observer.observe(element, { box: "border-box" });
      return () => observer.unobserve(element);
    },
    [minHeight, minWidth],
  );

  useLayoutEffect(() => {
    let rAFId: number;

    const notifyDataBoxChanged = throttle(
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

    return movementRef.current.events$.subscribe((evt) => {
      if (evt.topic === "start" && onStartProp) {
        onStartProp(evt.payload);
      } else if (evt.topic === "move" && onDragProp) {
        const { inner, outer } = evt.payload;
        onDragProp(
          new DOMRectReadOnly(
            inner.left - outer.left,
            inner.top - outer.top,
            inner.width,
            inner.height,
          ),
        );
        notifyDataBoxChanged(evt.payload);
      } else if (evt.topic === "end" && onEndProp) {
        const { inner, outer } = evt.payload;
        onEndProp(
          new DOMRectReadOnly(
            inner.left - outer.left,
            inner.top - outer.top,
            inner.width,
            inner.height,
          ),
        );
      }
    });
  }, []);

  const ctx = useMemo(() => {
    return {
      dataBox$: dataBox$Ref.current,
      onDragStart: (type, target, pageX, pageY) => {
        movementRef.current.onStart(type, target, pageX, pageY);
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
        ctx.onDragStart?.("mouse", "area", evt.pageX, evt.pageY);
      }}
      onTouchStart={(evt) => {
        if (evt.touches.length === 1) {
          ctx.onDragStart?.(
            "touch",
            "area",
            evt.touches[0].pageX,
            evt.touches[0].pageY,
          );
        }
      }}
    >
      {props.children}
    </div>
  );
}
