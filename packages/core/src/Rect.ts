export class Rect {
  constructor(
    public left: number,
    public top: number,
    public right: number,
    public bottom: number,
  ) {}

  get width() {
    return this.right - this.left;
  }

  get height() {
    return this.bottom - this.top;
  }
}
