import { useImmutableRef } from "@callcc/toolkit-js/react/useImmutableRef";
import { useMutableRef } from "@callcc/toolkit-js/react/useMutableRef";
import { useRefCallback } from "@callcc/toolkit-js/react/useRefCallback";
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
  onHandleDrag?: (dir: IDirection) => void;
  onAreaMove?: () => void;
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
      onMouseDown={(evt) => {
        evt.stopPropagation();
        ctx.onHandleDrag?.(dir);
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
   * @param dir
   */
  onStart?: (dir?: IDirection) => void;
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

  const movingArea = useRef(false);
  const movingHandle = useRef<"" | IDirection>("");

  useLayoutEffect(() => {
    let moved = false;
    let rAFId: number;

    const handleMove = (evt: MouseEvent) => {
      const nBox = nBoxRef.current;
      if (movingHandle.current) {
        if (movingHandle.current.includes("left")) {
          nBox.moveLeftLine(evt.pageX);
        }
        if (movingHandle.current.includes("right")) {
          nBox.moveRightLine(evt.pageX);
        }
        if (movingHandle.current.includes("top")) {
          nBox.moveTopLine(evt.pageY);
        }
        if (movingHandle.current.includes("bottom")) {
          nBox.moveBottomLine(evt.pageY);
        }
      }

      if (movingArea.current) {
        if (evt.movementX) {
          nBox.moveX(evt.movementX);
        }
        if (evt) {
          nBox.moveY(evt.movementY);
        }
      }

      if ((movingHandle.current || movingArea.current) && !moved) {
        moved = true;
        onStartProp?.(movingHandle.current || undefined);
      }

      if (movingHandle.current || movingArea.current) {
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
        }
        const box = nBox.toDataBox();
        rAFId = requestAnimationFrame(() => {
          dataBox$Ref.current.notify(box);
        });
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
      movingHandle.current = "";
      movingArea.current = false;
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      rAFId && cancelAnimationFrame(rAFId);
    };
  }, []);

  const ctx = useMemo(() => {
    return {
      dataBox$: dataBox$Ref.current,
      onAreaMove: () => {
        movingArea.current = true;
      },
      onHandleDrag: (dir) => {
        movingHandle.current = dir;
      },
    } satisfies ICropContext;
  }, [dataBox$Ref]);

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
  const clipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    return ctx.dataBox$.subscribe(({ outer, inner }) => {
      const clip = clipRef.current;
      if (clip) {
        clip.style.left = inner.left - outer.left + "px";
        clip.style.top = inner.top - outer.top + "px";
        clip.style.right = outer.right - inner.right + "px";
        clip.style.bottom = outer.bottom - inner.bottom + "px";
      }
    });
  }, [ctx.dataBox$]);

  return (
    <div
      ref={clipRef}
      className={props.className}
      style={props.style}
      onMouseDown={() => {
        ctx.onAreaMove?.();
      }}
    >
      {props.children}
    </div>
  );
}
