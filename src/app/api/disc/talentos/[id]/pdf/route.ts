import { PDFDocument, PageSizes, StandardFonts, rgb } from 'pdf-lib';
import { db } from '@/lib/db';
import { getSessionContext, canManageRecruiting } from '@/lib/session';
import { talentDiscScope } from '@/server/talent-disc';
import { textRecord } from '@/lib/i18n/pt-BR/assessment';

export async function GET(_request: Request, {params}: {params: Promise<{id:string}>}) {
  const ctx=await getSessionContext();
  if (!ctx || !canManageRecruiting(ctx)) return new Response(null,{status:404});
  const {id}=await params;
  const row=await db.talentDisc.findFirst({where:{id,...talentDiscScope(ctx.orgId),status:'COMPLETED'},include:{contact:{select:{name:true}}}});
  if (!row) return new Response(null,{status:404});
  const org=await db.organization.findUnique({where:{id:ctx.orgId},select:{name:true}});
  const result=textRecord(row.result);
  const pdf=await PDFDocument.create();
  pdf.setTitle('Relatório DISC — registro externo');
  const normal=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const chars=new Set(normal.getCharacterSet());
  const clean=(s:string)=>Array.from(s.normalize('NFC')).map(c=>c==='\n'?'\n':chars.has(c.codePointAt(0)??0)?c:'?').join('');
  const [width,height]=PageSizes.A4, margin=48, max=width-2*margin;
  let page=pdf.addPage(PageSizes.A4), y=height-margin;
  function line(s:string, heading=false) {
    const font=heading?bold:normal, size=heading?13:11;
    for(const p of clean(s).split('\n')){
      let chunk='';
      for(const ch of p){
        if(chunk && font.widthOfTextAtSize(chunk+ch,size)>max){
          if(y<60){page=pdf.addPage(PageSizes.A4);y=height-margin;}
          page.drawText(chunk,{x:margin,y,size,font,color:rgb(.10,.16,.23)}); y-=size+5;chunk='';
        }
        chunk+=ch;
      }
      if(y<60){page=pdf.addPage(PageSizes.A4);y=height-margin;}
      page.drawText(chunk,{x:margin,y,size,font,color:rgb(.10,.16,.23)});y-=size+5;
    }
    y-=5;
  }
  line(org?.name??'RGA ATS',true);line('Relatório DISC individual — registro externo',true);
  line('Profissional: '+row.contact.name);line('Instrumento: '+row.instrument);line('Data da avaliação: '+(result.date??''));
  line('Perfil informado: '+(result.profile??''),true);
  line(['D','I','S','C'].filter(a=>result[a]).map(a=>a+' '+result[a]).join(' | '));
  if(result.scaleMin)line('Escala original: '+result.scaleMin+' a '+result.scaleMax+' '+(result.scaleName??''));
  for(const [k,label] of Object.entries({traits:'Características profissionais',strengths:'Pontos fortes',development:'Pontos de desenvolvimento',communication:'Comunicação',notes:'Observações'})){
    if(result[k]){line(label,true);line(result[k]);}
  }
  line('Validade: '+(row.validUntil?.toISOString().slice(0,10)??'Não comprovada'));
  line('Registro conferido de avaliação externa. Não é laudo psicológico ou decisão de contratação.');
  pdf.getPages().forEach((p,i)=>p.drawText('Uso interno | '+(i+1)+' / '+pdf.getPageCount(),{x:margin,y:25,size:8,font:normal}));
  return new Response(Buffer.from(await pdf.save()),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="relatorio-disc.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive'}});
}
