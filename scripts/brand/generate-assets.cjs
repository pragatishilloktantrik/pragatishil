// Usage: node scripts/brand/generate-assets.cjs PATH_TO_GENERATED_SAPLING
// Generates web sizes and flag layouts from the approved reference-derived emblem.
const fs = require('fs');
const path = require('path');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const out = path.resolve('public/brand');
(async () => {
  const source = process.argv[2];
  if (!source) throw new Error('Pass the generated transparent sapling image');
  const emblem = await sharp(source).trim().resize({width:640,height:520,fit:'inside'}).png().toBuffer();
  fs.writeFileSync(path.join(out,'sapling.png'),emblem);
  const data = 'data:image/png;base64,'+emblem.toString('base64');
  const svg = (w,h,body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
  const mark = (bg) => svg(512,512,`<rect width="512" height="512" rx="56" fill="${bg}"/><image href="${data}" x="32" y="45" width="448" height="422"/>`);
  for (const [name,size] of [['favicon-16',16],['favicon-32',32],['apple-touch-icon',180],['icon-192',192],['icon-512',512]]) await sharp(mark('white')).resize(size,size).png().toFile(path.join(out,name+'.png'));
  for (const [name,bg] of [['blue','#eff6ff'],['red','#fff1f2']]) await sharp(mark(bg)).resize(160,160).png().toFile(path.join(out,`avatar-sapling-${name}.png`));
  const flag=svg(900,900,`<rect width="900" height="900" fill="white"/><rect width="900" height="254" fill="#0738ba"/><rect y="636" width="900" height="264" fill="#ff1717"/><image href="${data}" x="210" y="260" width="480" height="368"/>`);
  fs.writeFileSync(path.join(out,'flag-sapling.svg'),flag);
  await sharp(flag).png().toFile(path.join(out,'flag-sapling.png'));
  const flagData='data:image/png;base64,'+(await sharp(flag).png().toBuffer()).toString('base64');
  const social=svg(1200,630,`<rect width="1200" height="630" fill="#f8fafc"/><rect width="1200" height="14" fill="#0738ba"/><rect y="616" width="1200" height="14" fill="#ff1717"/><image href="${flagData}" x="72" y="157" width="300" height="300"/><g font-family="Arial Unicode MS, sans-serif" fill="#0f172a"><text x="420" y="272" font-size="44">प्रगतिशील लोकतान्त्रिक पार्टी</text><text x="420" y="335" font-size="30" font-family="Arial, sans-serif">Pragatishil Loktantrik Party</text><text x="420" y="397" font-size="32" fill="#0738ba">नेपाली माटो, हाम्रो बाटो</text><text x="420" y="456" font-size="27" font-family="Arial, sans-serif">pragatishil.org</text></g>`);
  await sharp(social).png().toFile(path.join(out,'social-preview.png'));
  fs.copyFileSync(path.join(out,'icon-192.png'),'public/favicon.png');
  // Existing avatar URLs remain compatible, but no longer render the retired eye.
  for (const name of ['red','blue']) {
    const avatar=fs.readFileSync(path.join(out,`avatar-sapling-${name}.png`));
    fs.writeFileSync(`public/placeholders/eye-${name}.svg`,svg(160,160,`<image href="data:image/png;base64,${avatar.toString('base64')}" width="160" height="160"/>`));
  }
  console.log('Sapling flag, icons, avatars, social preview and compatibility assets generated.');
})();
