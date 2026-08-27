export class MainThreadService {
  public n = 1;

  getNumber(): number {
    return this.n++;
  }
}
