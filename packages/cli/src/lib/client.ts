import type { Config } from './config.js';

export class ApiClient {
  constructor(private config: Config) {}

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.config.server}/api${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.token}`,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }

  get(path: string) {
    return this.request('GET', path);
  }
  post(path: string, body?: unknown) {
    return this.request('POST', path, body);
  }
}
