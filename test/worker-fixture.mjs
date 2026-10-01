let sequence = 0;
process.on('message', request => {
  if (request.type === 'shutdown') { process.exit(0); return; }
  if (request.action === 'hang') return;
  if (request.action === 'approval') { process.send({ type: 'approval', id: request.id, approvalId: request.id, request: { app: 'test.exe', displayName: 'Test' } }); return; }
  if (request.type === 'approval-result') { process.send({ id: request.approvalId, value: { accepted: request.accepted } }); return; }
  setTimeout(() => process.send({ id: request.id, value: { sequence: ++sequence } }), 20);
});
