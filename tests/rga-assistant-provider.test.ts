import { describe, it, expect, vi, afterEach } from 'vitest';
import { assistantProvider, assistantConfigured, assistantLimits, assistantChat } from '@/server/assistant-provider';
describe('Conexão direta do Assistente RGA', () => {
  const env = {RGA_ASSISTANT_ALLOW_EXTERNAL_AI:'true',RGA_ASSISTANT_PROVIDER:'groq',RGA_ASSISTANT_MODEL:'modelo-ficticio',RGA_ASSISTANT_TOKEN:'segredo-ficticio'};
  afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs()});
  it('só ativa mediante configuração explícita e oculta o segredo', () => {
    expect(assistantConfigured({GROQ_API_KEY:'teste'})).toBe(false);
    expect(assistantProvider({...env,RGA_ASSISTANT_ALLOW_EXTERNAL_AI:'false'})).toBeNull();
    expect(assistantProvider({...env,RGA_ASSISTANT_PROVIDER:'https://exemplo.invalid'})).toBeNull();
    expect(JSON.stringify(assistantProvider(env))).not.toContain('segredo-ficticio');
    expect(assistantLimits({RGA_ASSISTANT_DAILY_LIMIT:'-1'}).daily).toBe(0);
  });
  it('valida referências e não segue redirecionamentos', async () => {
    for(const [key,value] of Object.entries(env)) vi.stubEnv(key,value);
    const fake = vi.fn(async () => Response.json({choices:[{message:{content:JSON.stringify({answer:'Perfil [1] informou interesse.'})}}]}));
    vi.stubGlobal('fetch',fake);
    expect((await assistantChat('auxiliar',[{n:1,professional:'cargo: auxiliar'}])).answer).toContain('[1]');
    expect(fake).toHaveBeenCalledWith('https://api.groq.com/openai/v1/chat/completions',expect.objectContaining({redirect:'error'}));
    fake.mockImplementation(async () => Response.json({choices:[{message:{content:'{"answer":"Perfil [99]"}'}}]}));
    await expect(assistantChat('auxiliar',[{n:1,professional:'cargo: auxiliar'}])).rejects.toMatchObject({reason:'invalid_response'});
  });
});

 describe('API nativa DeepSeek', () => {
  afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs()});
  it('usa max_tokens e desativa thinking, preservando diagnóstico HTTP', async () => {
    vi.stubEnv('RGA_ASSISTANT_ALLOW_EXTERNAL_AI','true');
    vi.stubEnv('RGA_ASSISTANT_PROVIDER','deepseek');
    vi.stubEnv('RGA_ASSISTANT_MODEL','deepseek-flash');
    vi.stubEnv('RGA_ASSISTANT_TOKEN','teste-ficticio');
    const fake=vi.fn(async (_url:string, _init:RequestInit)=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"answer":"Perfil [1]."}'}}]}));
    vi.stubGlobal('fetch',fake);
    await assistantChat('teste',[{n:1,professional:'Auxiliar'}]);
    const body=JSON.parse(String(fake.mock.calls[0][1].body));
    expect(body).toMatchObject({model:'deepseek-flash',max_tokens:1800,thinking:{type:'disabled'}});
    expect(body).not.toHaveProperty('max_completion_tokens');
    fake.mockImplementation(async()=>new Response('{}',{status:402}));
    await expect(assistantChat('teste',[])).rejects.toMatchObject({reason:'http_402'});
    fake.mockImplementation(async()=>Response.json({choices:[{message:{content:' '}}]}));
    await expect(assistantChat('teste',[])).rejects.toMatchObject({reason:'empty_response'});
  });
});
