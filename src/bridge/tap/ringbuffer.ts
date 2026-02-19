/** Fixed-size ring buffer for recent frames. */
export class RingBuffer<T> {
  private buffer: T[] = [];
  private index = 0;

  constructor(private readonly capacity: number) {}

  push(item: T): void {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(item);
    } else {
      this.buffer[this.index] = item;
    }
    this.index = (this.index + 1) % this.capacity;
  }

  toArray(): T[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
    this.index = 0;
  }
}
