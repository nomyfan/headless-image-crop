import { cn } from "@callcc/toolkit-js/cn";
import { useRefCallback } from "@callcc/toolkit-js/react/useRefCallback";
import type { IDirection } from "headless-image-crop";
import { Crop } from "headless-image-crop";
import { useMemo, useRef, useState } from "react";

import styles from "./styles.module.css";

function draw(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  rect: DOMRectReadOnly,
) {
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const ratioX = img.naturalWidth / img.clientWidth;
  const ratioY = img.naturalHeight / img.clientHeight;

  const x = rect.x * ratioX;
  const y = rect.y * ratioY;
  const width = rect.width * ratioX;
  const height = rect.height * ratioY;

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
}

const handles = ["top", "bottom", "left", "right"] satisfies IDirection[];

function Mirror(props: { file?: File }) {
  const { file } = props;

  const imgRef = useRef<HTMLImageElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const key = useMemo(() => {
    return file ? Math.random() : null;
  }, [file]);

  const refCallback = useRefCallback(
    (element: HTMLImageElement) => {
      imgRef.current = element;
      if (file) {
        const url = URL.createObjectURL(file);
        element.src = url;
        return () => {
          URL.revokeObjectURL(url);
        };
      }
    },
    [file],
  );

  if (!file) {
    return null;
  }

  return (
    <div className="flex">
      <Crop
        key={key}
        containerClassName="select-none flex-basis-0 flex-grow"
        clipClassName={cn(styles.clip, styles.marching_ants)}
        handleClassName={cn(
          "rounded-full bg-indigo-500 b-solid b-2 b-white h-12px w-12px box-border",
        )}
        handles={handles}
        minWidth={24}
        minHeight={24}
        onDrag={(rect) => {
          const img = imgRef.current!;
          const canvas = canvasRef.current!;
          draw(canvas, img, rect);
        }}
        onEnd={(rect) => {
          const img = imgRef.current!;
          const canvas = canvasRef.current!;
          draw(canvas, img, rect);
        }}
        initialRect={{
          left: 25,
          top: 25,
          width: 50,
          height: 50,
          unit: "%",
        }}
      >
        <img
          ref={refCallback}
          style={{ display: "block", width: "100%" }}
          alt=""
          draggable={false}
          onLoad={() => {
            const img = imgRef.current!;
            const canvas = canvasRef.current!;
            draw(
              canvas,
              img,
              new DOMRectReadOnly(
                Math.round(img.clientWidth * 0.25),
                Math.round(img.clientHeight * 0.25),
                Math.round(img.clientWidth * 0.5),
                Math.round(img.clientHeight * 0.5),
              ),
            );
          }}
        />
      </Crop>

      <div className="flex-basis-0 flex-grow">
        <canvas ref={canvasRef} className="w-full" />
      </div>
    </div>
  );
}

export function App() {
  const [file, setFile] = useState<File>();

  return (
    <main>
      <input
        type="file"
        accept="image/png,image/jpg,image/jpeg"
        onChange={(evt) => {
          if (evt.target.files && evt.target.files.length) {
            setFile(evt.target.files[0]);
          }
        }}
      />
      <Mirror file={file} />
    </main>
  );
}
