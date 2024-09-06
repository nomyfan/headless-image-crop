import { useMutableRef } from "@callcc/toolkit-js/react/useMutableRef";
import type { CSSProperties, PropsWithChildren } from "react";
import { useCallback, useId, useLayoutEffect, useMemo, useRef } from "react";

import { NestedBox } from "./NestedBox";
import type { IDirection } from "./types";

export type ICropProps = PropsWithChildren<{
  containerStyle?: CSSProperties;
  containerClassName?: string;
  clipStyle?: CSSProperties;
  clipClassName?: string;
  minHeight?: number;
  minWidth?: number;
  handleClassName?: string;
  handles?: IDirection[];
  mask?: {
    fill?: string;
    fillOpacity?: number;
  };
  // TODO: handle callback deps lint error
  onStart?: (dir?: IDirection) => void;
  onDrag?: (rect: DOMRectReadOnly) => void;
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

function Handle(props: {
  className?: string;
  dir: IDirection;
  onStart: (dir: IDirection) => void;
}) {
  const dir = props.dir;
  const left = props.dir.includes("left");
  const top = props.dir.includes("top");

  return (
    <div
      className={props.className}
      data-handle-dir={dir}
      onMouseDown={(evt) => {
        evt.stopPropagation();
        props.onStart(props.dir);
      }}
      style={{
        position: "absolute",
        left: left ? 0 : dir === "top" || dir === "bottom" ? "50%" : "100%",
        top: top ? 0 : dir === "left" || dir === "right" ? "50%" : "100%",
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}

export function Crop(props: ICropProps) {
  const reactId = useId();
  // Used to measure the size of content box of the container.
  const contentBoxRef = useRef<SVGSVGElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);

  const minWidth = props.minWidth ?? 0;
  const minHeight = props.minHeight ?? 0;

  const movingArea = useRef(false);
  const movingHandle = useRef<"" | IDirection>("");

  const commit = useCallback(
    (nBox: NestedBox) => {
      const clip = clipRef.current;
      if (clip) {
        const { inner, outer } = nBox;
        clip.style.left = inner.left - outer.left + "px";
        clip.style.top = inner.top - outer.top + "px";
        clip.style.right = outer.right - inner.right + "px";
        clip.style.bottom = outer.bottom - inner.bottom + "px";

        const maskRect = document.getElementById(
          `${reactId}-mask-rect`,
        ) as SVGRectElement | null;
        if (maskRect) {
          maskRect.setAttribute("x", inner.left - outer.left + "px");
          maskRect.setAttribute("y", inner.top - outer.top + "px");
          maskRect.setAttribute("width", inner.width + "px");
          maskRect.setAttribute("height", inner.height + "px");
        }
      }
    },
    [reactId],
  );

  const nBoxRef = useMutableRef(() => {
    return new NestedBox(0, 0, 0, 0, 0, 0);
  });

  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].target.getBoundingClientRect();
      const rectPrev = nBoxRef.current.outer;
      if (
        rectPrev.left !== rect.left ||
        rectPrev.top !== rect.top ||
        rectPrev.right !== rect.right ||
        rectPrev.bottom !== rect.bottom
      ) {
        nBoxRef.current = new NestedBox(
          rect.left,
          rect.top,
          rect.right,
          rect.bottom,
          minWidth,
          minHeight,
          props.initialRect,
        );
        if (props.initialRect) {
          commit(nBoxRef.current);
        }
      }
    });

    const element = contentBoxRef.current!;
    observer.observe(element, { box: "border-box" });

    return () => observer.unobserve(element);
  }, [minHeight, minWidth]);

  useLayoutEffect(() => {
    let moved = false;
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
        if (props.onStart) {
          props.onStart(movingHandle.current || undefined);
        }
      }

      if (movingHandle.current || movingArea.current) {
        if (props.onDrag) {
          const { inner, outer } = nBoxRef.current;
          props.onDrag(
            new DOMRectReadOnly(
              inner.left - outer.left,
              inner.top - outer.top,
              inner.width,
              inner.height,
            ),
          );
        }
        requestAnimationFrame(commit.bind(null, nBox));
      }
    };

    const handleUp = () => {
      if (moved) {
        if (props.onEnd) {
          const { inner, outer } = nBoxRef.current;
          props.onEnd(
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
    };
  }, [reactId]);

  const handleStart = useCallback((dir: IDirection) => {
    movingHandle.current = dir;
  }, []);

  const handles = useMemo(() => {
    const dirs: IDirection[] = props.handles ?? [
      "left",
      "left-top",
      "top",
      "right-top",
      "right",
      "right-bottom",
      "bottom",
      "left-bottom",
    ];

    return dirs.map((dir) => {
      return (
        <Handle
          key={dir}
          className={props.handleClassName}
          dir={dir}
          onStart={handleStart}
        />
      );
    });
  }, [handleStart, props.handleClassName, props.handles]);

  return (
    <div
      className={props.containerClassName}
      style={{
        position: "relative",
        width: "fit-content",
        minWidth,
        minHeight,
        ...props.containerStyle,
      }}
    >
      {props.children}

      <svg
        ref={contentBoxRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <defs>
          <mask id={`${reactId}-mask`}>
            <rect width="100%" height="100%" fill="white" />
            <rect
              id={`${reactId}-mask-rect`}
              x={0}
              y={0}
              width="100%"
              height="100%"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          fill={props.mask?.fill}
          fillOpacity={props.mask?.fillOpacity ?? 0.5}
          width="100%"
          height="100%"
          mask={`url(#${reactId}-mask)`}
        />
      </svg>

      <div
        ref={clipRef}
        className={props.clipClassName}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          ...props.clipStyle,
        }}
        onMouseDown={() => {
          movingArea.current = true;
        }}
      >
        {handles}
      </div>
    </div>
  );
}
