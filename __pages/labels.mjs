// Bilingual tables of contents supply the same chapter titles across editions.
export function tocLabels(markdown) {
  const labels = new Map();
  for (const match of markdown.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)/gm)) {
    const [english, chinese] = match[1].split(' · ');
    if (!chinese || !/[A-Za-z]/.test(english)) continue;
    const chapter = /^第(\d+)章\s*(.+)$/.exec(chinese);
    labels.set(chapter ? String(Number(chapter[1])) : chinese, [chapter ? chapter[2] : chinese, english]);
  }
  return labels;
}

const extras = {
  'Front Matter':['卷首','Front Matter'], 'Preface':['序言','Preface'],
  'Photo Inserts':['插图','Photo Inserts'], 'Acknowledgments':['致谢','Acknowledgments'],
  'Bibliographical Essay and Sources':['文献述评与资料来源','Bibliographical Essay and Sources'],
  'References':['引用书目','References'],
  '中文版推荐序':'Foreword to the Chinese Edition',
  '中文版导读 · 林明仁':'Reader’s Introduction by Lin Ming-jen',
  '中文版导读 · 陈嘉铭':'Reader’s Introduction by Chen Chia-ming',
  '各界推荐':'Praise for the Book',
  '前言':'Preface','出版前言':'Publisher’s Foreword',
  '代序 沉思与反抗——纪念汉娜·阿伦特100周年诞辰':'Foreword: Reflection and Resistance on Hannah Arendt’s Centenary',
  '附录一 阿伦特、布鲁希尔生平大事记':'Appendix I: A Chronology of Arendt and Blücher',
  '附录二 一次基础课程的讲稿':'Appendix II: Lecture Notes for an Introductory Course'
};
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const parts = '一 二 三 四 五 六 七 八 九 十 十一 十二 十三'.split(' ');
export function chapterLabel(item, labels) {
  const fromBook = labels?.get(item.number ? String(Number(item.number)) : item.name);
  if (fromBook) return fromBook;
  const extra = extras[item.name];
  if (extra) return Array.isArray(extra) ? extra : [item.name, extra];
  const part = /^第(.+?)部分 (.+)$/.exec(item.name);
  if (part && parts.includes(part[1])) {
    const dates = part[2].replace(/(?:(\d+)年)?(\d+)月/g, (_,y,m)=>months[Number(m)-1]+(y?' '+y:'')).replace('—','–').replace('和',' and ');
    return [item.name, 'Part '+(parts.indexOf(part[1])+1)+' · '+dates];
  }
  return [item.name,''];
}
