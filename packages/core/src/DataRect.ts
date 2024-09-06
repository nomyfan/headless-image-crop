export class DataRect {
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

  clone() {
    return new DataRect(this.left, this.top, this.right, this.bottom);
  }

  equal(other: { left: number; top: number; right: number; bottom: number }) {
    return (
      this.left === other.left &&
      this.top === other.top &&
      this.right === other.right &&
      this.bottom === other.bottom
    );
  }
}
