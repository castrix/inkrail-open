import { createInterface } from 'node:readline'
let threads = 0
let active
const send = value => process.stdout.write(JSON.stringify(value) + '\n')
for await (const line of createInterface({ input: process.stdin })) {
  const { id, method, params } = JSON.parse(line)
  const reply = result => send({ id, result })
  if (method === 'initialize') reply({})
  if (method === 'thread/start') {
    if (!params.ephemeral || params.config['memories.use_memories'] !== false) throw new Error('Thread is not isolated')
    active = { threadId: `thread-${++threads}`, turnId: `turn-${threads}`, settings: params }
    reply({ thread: { id: active.threadId } })
  }
  if (method === 'turn/start') {
    if (params.input[0].text === 'crash') process.exit(9)
    if (params.input[0].text === 'hang-rpc') continue
    // Notifications can arrive before the response to turn/start.
    send({ method: 'turn/started', params: { threadId: active.threadId, turn: { id: active.turnId } } })
    reply({ turn: { id: active.turnId } })
    if (params.input[0].text === 'timed') {
      await new Promise(resolve => setTimeout(resolve, 40))
      send({ method: 'item/reasoning/textDelta', params: { threadId: active.threadId, delta: 'thinking' } })
      await new Promise(resolve => setTimeout(resolve, 40))
    }
    if (params.input[0].text === 'wait') continue
    send({ method: 'item/completed', params: { threadId: 'unrelated', item: { type: 'agentMessage', text: 'wrong thread' } } })
    send({ method: 'item/completed', params: { threadId: active.threadId, item: { type: 'agentMessage', phase: 'final_answer', text: JSON.stringify({ prompt: params.input[0].text, settings: active.settings, turn: params }) } } })
    send({ method: 'item/completed', params: { threadId: active.threadId, item: { type: 'agentMessage', phase: 'commentary', text: 'wrong phase' } } })
    send({ method: 'turn/completed', params: { threadId: active.threadId, turn: { id: active.turnId, status: params.input[0].text === 'fail' ? 'failed' : 'completed', error: { message: 'fixture failure' } } } })
  }
  if (method === 'turn/interrupt') {
    reply({})
    send({ method: 'turn/completed', params: { threadId: active.threadId, turn: { id: active.turnId, status: 'interrupted' } } })
  }
  if (method === 'thread/unsubscribe') reply({ status: 'unsubscribed' })
}
