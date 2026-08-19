export const apiPost = async <T>(
  path: string,
  payload: unknown = {},
): Promise<T> => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? `请求失败：${response.status}`);
  }
  return result;
};

export const apiGet = async <T>(path: string): Promise<T> => {
  const response = await fetch(path);
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? `请求失败：${response.status}`);
  }
  return result;
};
