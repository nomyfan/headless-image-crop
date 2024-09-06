import { useMutableRef } from "@callcc/toolkit-js/react/useMutableRef";
import { useRefCallback } from "@callcc/toolkit-js/react/useRefCallback";
import type { CSSProperties, PropsWithChildren, Ref } from "react";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  createContext,
  useContext,
  createRef,
  useImperativeHandle,
} from "react";

import { NestedBox } from "./NestedBox";
import type { IDirection } from "./types";

type ICropClipContext = {
  ref: Ref<Element>;
  onClipStart?: (dir: IDirection) => void;
  onMoveStart?: () => void;
};

const CropClipContext = createContext<ICropClipContext>({
  ref: createRef(),
});
export const useCropClipContext = () => useContext(CropClipContext);

type ICropContext = {
  commitHandle?: Ref<{
    commit?: (nBox: NestedBox) => void;
  }>;
};
const CropContext = createContext<ICropContext>({});
export const useCropContext = () => useContext(CropContext);

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

export interface ICropClipProps {
  fill?: string;
  fillOpacity?: number;
  className?: string;
  style?: CSSProperties;
  handles?: IDirection[];
  handleClassName?: string;
}

function CropClipImpl(props: ICropClipProps) {
  const cropContext = useCropContext();
  const cropClipContext = useCropClipContext();
  const id = useId();

  const clipRef = useRef<HTMLDivElement>(null);
  const maskRectRef = useRef<SVGRectElement>(null);

  useImperativeHandle(cropContext.commitHandle, () => ({
    commit: (nBox: NestedBox) => {
      const clip = clipRef.current;
      if (clip) {
        const { inner, outer } = nBox;
        clip.style.left = inner.left - outer.left + "px";
        clip.style.top = inner.top - outer.top + "px";
        clip.style.right = outer.right - inner.right + "px";
        clip.style.bottom = outer.bottom - inner.bottom + "px";

        const maskRect = maskRectRef.current;
        if (maskRect) {
          maskRect.setAttribute("x", inner.left - outer.left + "px");
          maskRect.setAttribute("y", inner.top - outer.top + "px");
          maskRect.setAttribute("width", inner.width + "px");
          maskRect.setAttribute("height", inner.height + "px");
        }
      }
    },
  }));

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
          onStart={() => cropClipContext.onClipStart?.(dir)}
        />
      );
    });
  }, [cropClipContext, props.handleClassName, props.handles]);

  return (
    <>
      <svg
        ref={cropClipContext.ref as Ref<SVGSVGElement>}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <defs>
          <mask id={`${id}-mask`}>
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
          mask={`url(#${id}-mask)`}
        />
      </svg>

      <div
        ref={clipRef}
        className={props.className}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          ...props.style,
        }}
        onMouseDown={() => cropClipContext.onMoveStart?.()}
      >
        {handles}
      </div>
    </>
  );
}

export function CropClip(props: PropsWithChildren<ICropClipProps>) {
  const { children, ...clipProps } = props;
  return children ?? <CropClipImpl {...clipProps} />;
}

export function Crop(props: ICropProps) {
  const minWidth = props.minWidth ?? 0;
  const minHeight = props.minHeight ?? 0;

  const commitRef = useRef<{
    commit?: (nBox: NestedBox) => void;
  }>(null);

  const contentBoxRef = useRefCallback(
    (element: Element) => {
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
            commitRef.current?.commit?.(nBoxRef.current);
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

  const nBoxRef = useMutableRef(() => {
    return new NestedBox(0, 0, 0, 0, 0, 0);
  });

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
        if (commitRef.current?.commit) {
          rAFId = requestAnimationFrame(() => {
            commitRef.current?.commit?.(nBox);
          });
        }
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
      rAFId && cancelAnimationFrame(rAFId);
    };
  }, []);

  const cropContext = useMemo(() => {
    return {
      commitHandle: commitRef,
    } satisfies ICropContext;
  }, []);

  const cropClipContext = useMemo(() => {
    return {
      ref: contentBoxRef,
      onMoveStart: () => {
        movingArea.current = true;
      },
      onClipStart: (dir: IDirection) => {
        movingHandle.current = dir;
      },
    } satisfies ICropClipContext;
  }, [contentBoxRef]);

  return (
    <CropContext.Provider value={cropContext}>
      <CropClipContext.Provider value={cropClipContext}>
        <div
          className={props.className}
          style={{
            minWidth,
            minHeight,
            ...props.style,
          }}
        >
          {props.children}
        </div>
      </CropClipContext.Provider>
    </CropContext.Provider>
  );
}
