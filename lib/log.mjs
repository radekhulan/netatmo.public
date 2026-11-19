const priorities = { info: 6, warning: 4, error: 3 };

export function logEvent(level, event, fields = {}, error) {
  const code = error?.code ?? error?.cause?.code;
  const details = error && {
    type: error.name,
    code: /^[a-z\d_-]{1,24}$/i.test(code ?? '') ? code : undefined,
    message: error instanceof SyntaxError ? 'Neplatná odpověď' : error.message?.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 240),
  };
  console.log('<' + priorities[level] + '>' + JSON.stringify({ event, ...fields, error: details }));
}
