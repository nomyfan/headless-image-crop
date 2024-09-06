import { clamp } from "@callcc/toolkit-js/clamp";

import { Rect } from "./Rect";

export class NestedBox {
  /**
   * Size and position of inner box in the viewport.
   * Gain via `getBoundingClientRect`.
   * @private
   */
  private readonly _inner: Rect;
  /**
   * Size and position of outer box in the viewport.
   * Gain via `getBoundingClientRect`.
   * @private
   */
  private readonly _outer: Rect;

  private readonly _minWidth: number;
  private readonly _minHeight: number;

  constructor(
    left: number,
    top: number,
    right: number,
    bottom: number,
    minWidth = 0,
    minHeight = 0,
    offset?:
      | {
          left: number;
          top: number;
          width: number;
          height: number;
          unit?: "px" | "%";
        }
      | undefined,
  ) {
    this._inner = new Rect(left, top, right, bottom);
    this._outer = new Rect(left, top, right, bottom);

    this._minWidth = minWidth;
    this._minHeight = minHeight;

    if (offset) {
      const ml =
        offset.unit === "%"
          ? Math.round((offset.left / 100) * this._outer.width)
          : offset.left;
      const mt =
        offset.unit === "%"
          ? Math.round((offset.top / 100) * this._outer.height)
          : offset.top;
      const w =
        offset.unit === "%"
          ? Math.round((offset.width / 100) * this._outer.width)
          : offset.width;
      const h =
        offset.unit === "%"
          ? Math.round((offset.height / 100) * this._outer.height)
          : offset.height;
      this.moveLeftLine(this._outer.left + ml);
      this.moveTopLine(this._outer.top + mt);
      this.moveRightLine(this._inner.left + w);
      this.moveBottomLine(this._inner.top + h);
    }
  }

  get outer() {
    return this._outer;
  }

  get inner() {
    return this._inner;
  }

  moveLeftLine(x: number) {
    this._inner.left = clamp(
      this._outer.left,
      Math.max(this._outer.left, this._inner.right - this._minWidth),
      x,
    );
  }

  moveTopLine(y: number) {
    this._inner.top = clamp(
      this._outer.top,
      Math.max(this._outer.top, this._inner.bottom - this._minHeight),
      y,
    );
  }

  moveRightLine(x: number) {
    this._inner.right = clamp(
      Math.min(this._outer.right, this._inner.left + this._minWidth),
      this._outer.right,
      x,
    );
  }

  moveBottomLine(y: number) {
    this._inner.bottom = clamp(
      Math.min(this._outer.bottom, this._inner.top + this._minHeight),
      this._outer.bottom,
      y,
    );
  }

  moveX(dx: number) {
    if (dx > 0) {
      // right
      dx = Math.min(dx, this._outer.right - this._inner.right);
    } else if (dx < 0) {
      // left
      dx = Math.max(dx, this._outer.left - this._inner.left);
    }
    if (dx) {
      this._inner.left += dx;
      this._inner.right += dx;
    }
  }

  moveY(dy: number) {
    if (dy > 0) {
      // down
      dy = Math.min(dy, this._outer.bottom - this._inner.bottom);
    } else if (dy < 0) {
      // up
      dy = Math.max(dy, this._outer.top - this._inner.top);
    }
    if (dy) {
      this._inner.top += dy;
      this._inner.bottom += dy;
    }
  }
}
