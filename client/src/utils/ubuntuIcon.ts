/** Local Ubuntu branding, independent of provider/model routing. */
export const ubuntuIconURL = '/assets/ubuntu-circle.svg';
export const isUbuntuEndpoint = (endpoint?: string | null) =>
  ['Ubuntu CPU Titles', 'Ubuntu vLLM', 'Ubuntu NInfer'].includes(endpoint ?? '');
