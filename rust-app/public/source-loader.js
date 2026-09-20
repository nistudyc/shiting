export function createSourceLoader({write, reset, apply, failed}) {
  let generation = 0;
  let writes = Promise.resolve();
  const load = async (value, label) => {
    const operation = ++generation;
    const current = () => operation === generation;
    try {
      const parsed = new URL(value);
      reset();
      const result = writes.then(() => current() ? write(value) : undefined);
      writes = result.catch(() => {});
      const data = await result;
      if (current() && data) await apply(data, value, label || parsed.hostname);
    } catch (error) { if (current()) failed(error); }
  };
  return {load, untouched:() => generation === 0};
}
