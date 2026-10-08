"use strict";
/* 绣忆 · story.js — 叙事数据（剧本 / 热点 / 记忆 / 谜题）
   全部剧情数据驱动：加章节只需在此追加 beat 数组与谜题定义。
   beat 类型：bg / card / say / choice / puzzle / memory / facehoop /
              dissolve / album / titlecard / goto / flag / music / wait /
              show(立绘上台) / clear(退场) / letter / phone / flashback /
              forget(病程等级) / shake */
XY.Story = (function () {
  const U = XY.Util;

  const TITLES = { game: '绣忆', sub: 'Unfinished Dowry · 一件未完成的嫁衣' };

  // ---------- 谜题几何 ----------
  function petal(cx, cy, len, wid, angDeg) {
    const a = angDeg * Math.PI / 180;
    const d = { x: Math.cos(a), y: Math.sin(a) }, pr = { x: -d.y, y: d.x };
    const tip = { x: cx + d.x * len / 2, y: cy + d.y * len / 2 };
    const base = { x: cx - d.x * len / 2, y: cy - d.y * len / 2 };
    const s1 = U.sampleBezier(base,
      { x: base.x + pr.x * wid / 2 + d.x * len * 0.22, y: base.y + pr.y * wid / 2 + d.y * len * 0.22 },
      { x: tip.x + pr.x * wid * 0.34, y: tip.y + pr.y * wid * 0.34 }, tip, 13);
    const s2 = U.sampleBezier(tip,
      { x: tip.x - pr.x * wid * 0.34, y: tip.y - pr.y * wid * 0.34 },
      { x: base.x - pr.x * wid / 2 + d.x * len * 0.22, y: base.y - pr.y * wid / 2 + d.y * len * 0.22 }, base, 13);
    return s1.concat(s2.slice(1));
  }

  function arc(cx, cy, r, a0, a1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return pts;
  }

  const PUZZLES = {
    haitang_tut: {
      name: '平针 · 海棠',
      hint: '从起针点出发，依次穿过每个针眼',
      thread: '#b03a2e',
      paths: [petal(640, 380, 300, 160, -90)]
    },
    bingdilian: {
      name: '并蒂莲 · 三段线',
      hint: '先茎，后花——她十二岁那年，也是这么绣的',
      thread: '#7a8a5f',
      paths: [
        U.sampleBezier({ x: 630, y: 600 }, { x: 560, y: 500 }, { x: 660, y: 420 }, { x: 600, y: 330 }, 16),
        petal(600, 278, 150, 92, -90),
        petal(712, 238, 126, 78, -70)
      ],
      threads: ['#7a8a5f', '#d4838f', '#d4838f']
    },
    peony: {
      name: '嫁衣 · 牡丹',
      hint: '大瓣、内瓣、花蕊——最后三段',
      thread: '#8c2b22',
      paths: [
        petal(600, 400, 330, 210, -105),
        petal(724, 348, 250, 150, -45),
        arc(600, 268, 62, Math.PI * 1.15, Math.PI * 1.85, 12)
      ],
      threads: ['#8c2b22', '#b03a2e', '#c9a86a']
    }
  };

  // ---------- 记忆条目 ----------
  const MEMORIES = {
    haitang: {
      title: '海棠 · 嫁衣', icon: 'hoop',
      text: '五十六年前的春天，她给自己绣了这枝海棠。\n针脚齐整，一丝不乱。\n她想：手艺还在。'
    },
    thimble: {
      title: '铜顶针', icon: 'thimble',
      text: '磨得发亮的铜顶针。\n戴在中指上，五十六年——\n像长在那儿一样。'
    },
    bingdi: {
      title: '并蒂莲枕套', icon: 'basket',
      text: '十二岁头一回上绷，绣的就是并蒂莲。\n她娘在旁边看着，说：\n「线要听话，人也要听话。」'
    },
    manyue: {
      title: '念念的满月照', icon: 'photo',
      text: '满月的念念，攥着一根绣花针，不哭。\n满酒席的人都笑了——\n「这伢子，吃定了这碗饭。」',
      corruptText: '谁家伢子的满月照？\n攥着根针做什么，危险。\n……这是放在我家相框里的吗？',
      fade: 0.45
    },
    phone: {
      title: '电话号码', icon: 'phone',
      text: '电话机旁贴着一张纸条——\n「念念 139××××××××」\n末尾几个数字，被油烟洇糊了。',
      corruptText: '「1 3 ▢ …」\n后面是几？\n这张纸条，是谁写的？',
      fade: 0.7
    },
    medicine: {
      title: '医院的纸袋', icon: 'medicine',
      text: '印着红十字的白纸袋。\n里面的单子折得很小，\n压在针线匣的最底层。'
    }
  };

  const CORRUPT_SPRING = ['manyue', 'phone'];

  // ---------- 序章 ----------
  const PROLOGUE = [
    { bg: 'rain' },
    { card: '江南的雨下起来，\n是要绣进线里去的。' },
    { card: '青石巷尾，沈家。\n灯，还亮着。' },
    { bg: 'hoop' },
    { card: '沈绣云，六岁学针，十二岁上绷，\n绣了五十六年。' },
    { card: '她替人家绣过龙凤呈祥，\n绣过戏台上的蟒袍，\n也给自己绣过嫁衣上的一枝海棠。' },
    { bg: 'dress' },
    { show: [{ char: 'xiuyun', expr: 'smile', pos: 'center' }] },
    { card: '如今，女儿念念，要出嫁了。' },
    { card: '按老规矩——\n嫁衣的最后一段，\n须由母亲亲手收针。' },
    { clear: true },
    { bg: 'hoop' },
    { puzzle: 'haitang_tut' },
    { memory: 'haitang' },
    { card: '针脚齐整，一丝不乱。\n她想：手艺还在。' },
    { titlecard: { char: '春', sub: '沈家 · 堂屋' } },
    { goto: 'explore' }
  ];

  const CONTINUE_BEATS = [
    { card: '（续）\n堂屋的窗，还开着。' },
    { goto: 'explore' }
  ];

  // ---------- 春 · 探索热点 ----------
  const HOTSPOTS = [
    {
      id: 'hoopCenter', x: 660, y: 300, r: 120, label: '绣绷 · 嫁衣', icon: 'hoop',
      requires: ['thimble', 'basket'],
      lockedBeats: [
        { card: '没有顶针，指头吃不住劲。\n\n（窗台上、笸箩边，都找找看。）' }
      ],
      beats: [
        { card: '嫁衣上的牡丹，还差最后三段。' },
        { puzzle: 'peony' },
        { card: '牡丹开了七分。\n有一瓣的颜色——\n是灰的。' },
        { flag: 'peony' }
      ]
    },
    {
      id: 'basket', x: 250, y: 520, r: 100, label: '丝线笸箩', icon: 'basket',
      beats: [
        { card: '笸箩里躺着几十股丝线。\n红是红，绿是绿，灰是灰。' },
        {
          choice: {
            prompt: '她要找绿色的线。',
            options: [
              {
                text: '悄悄把灰线换成绿线',
                then: [
                  { say: { speaker: '绣云', text: '……小绿是哪股来着。' } },
                  { card: '她捏着两股线，对了对，又对了对。\n灰色，绿色。\n她想：灯，该换了。' }
                ]
              },
              {
                text: '没有留意。她拈起了灰线',
                then: [
                  { card: '灰色，绿色。\n她拈起左边那一股，\n稳稳地，穿进了针眼。' }
                ]
              }
            ]
          }
        },
        { say: { speaker: '绣云', text: '这块并蒂莲的枕套——是我十二岁，头一回上绷绣的。我娘在边上说：线要听话，人也要听话。' } },
        { card: '（替她把这段旧绣，重新走一遍。）' },
        { puzzle: 'bingdilian' },
        { memory: 'bingdi' },
        { flag: 'basket' }
      ]
    },
    {
      id: 'thimble', x: 1070, y: 394, r: 70, label: '窗台', icon: 'thimble',
      beats: [
        { card: '窗台上搁着铜顶针，磨得发亮。\n戴在中指上，五十六年——\n像长在那儿一样。' },
        { memory: 'thimble' },
        { flag: 'thimble' }
      ]
    },
    {
      id: 'medicine', x: 80, y: 432, r: 80, label: '门边的纸袋', icon: 'medicine',
      beats: [
        { card: '门边挂着一只白纸袋，\n边角印着红十字。\n医院的名字，被指甲掐过，起了毛。' },
        { say: { speaker: '绣云', text: '……没事没事，陪王阿姨去的。她眼花，挂个号都要人领。' } },
        { card: '纸袋最底下压着一张单子。\n她没看第二眼，把它折小，\n塞进了针线匣的最底层。' },
        { memory: 'medicine' },
        { flag: 'medicine' }
      ]
    },
    {
      id: 'phone', x: 1010, y: 478, r: 80, label: '电话机', icon: 'phone',
      beats: [
        { card: '墨绿色的电话机。\n旁边贴着一张纸条——\n「念念 139××××××××」' },
        { card: '末尾几个数字，被油烟洇糊了。\n但她的手指，每天都还会在上面\n无意识地划一遍。' },
        { memory: 'phone' },
        { flag: 'phone' }
      ]
    },
    {
      id: 'photos', x: 307, y: 235, r: 120, label: '照片墙', icon: 'photo',
      beats: [
        { bg: 'photowall' },
        { card: '满墙的照片。\n最中间那张——念念满月，\n攥着一根绣花针，不哭。' },
        { card: '满酒席的人都笑：\n「这伢子，吃定了这碗饭。」' },
        { memory: 'manyue' },
        { bg: 'room' },
        { flag: 'photos' }
      ]
    }
  ];

  const REQUIRED = ['thimble', 'basket', 'medicine', 'phone', 'photos', 'peony'];

  // ---------- 女儿回家（傍晚） ----------
  const DAUGHTER = [
    { bg: 'room', bgOpts: { evening: true } },
    { show: [{ char: 'xiuyun', expr: 'smile', pos: 'left' }, { char: 'niannian', expr: 'smile', pos: 'right' }] },
    { music: { action: 'pad', on: false } },
    { card: '傍晚，门响了。' },
    { say: { speaker: '念念', text: '妈——我回来啦！哟，又绣呢？' } },
    { say: { speaker: '绣云', expr: 'focus', text: '就差牡丹了。来，试试。' } },
    { card: '念念套上嫁衣，\n在镜子前转了个圈。' },
    { say: { speaker: '念念', expr: 'smile', text: '妈，好看吗？' } },
    { say: { speaker: '绣云', expr: 'confuse', text: '好看。……阿珍小时候穿红，也这么好看。' } },
    { card: '屋里，静了一下。' },
    { say: { speaker: '念念', expr: 'worried', text: '……妈。我是念念。阿珍，是我姨。' } },
    { say: { speaker: '绣云', expr: 'vacant', text: '口误，口误。人老了，舌头比脑子快。' } },
    { say: { speaker: '念念', expr: 'hurt', text: '……嗯。对了妈，王阿姨说，上礼拜陪她去医院的是你？她眼花什么呀，她棋摊上杀三盘都不带眨眼的。' } },
    { say: { speaker: '绣云', expr: 'sad', text: '……年轻人，话怎么这么多。去洗手，锅里给你留着绿豆汤。' } },
    {
      choice: {
        prompt: '【念念】',
        options: [
          {
            text: '再问一句',
            then: [
              { say: { speaker: '念念', expr: 'worried', text: '妈，到底——' } },
              { say: { speaker: '绣云', expr: 'focus', text: '念念。' } },
              { card: '她声音很轻，眼睛没有离开绣绷。\n\n「嫁衣快好了。别让针脚，等线。」' },
              { card: '念念张了张嘴，\n到底没有再问。' }
            ]
          },
          {
            text: '不问了',
            then: [
              { card: '有些话，一出口就成了刺。\n\n念念把话咽了回去——\n像咽下一根断了线的针。' }
            ]
          }
        ]
      }
    },
    { card: '那天晚上，堂屋的灯，\n亮到很晚。' },
    { clear: true },
    { goto: 'night' }
  ];

  // ---------- 深夜独坐 → 人脸变绣绷 ----------
  const NIGHT = [
    { bg: 'room', bgOpts: { evening: true } },
    { show: [{ char: 'xiuyun', expr: 'calm', pos: 'center' }] },
    { card: '夜深了。\n绣云一个人，坐在照片墙前。' },
    { bg: 'photowall' },
    { card: '她想起念念小时候的脸。' },
    { card: '……是圆脸，\n还是尖脸来着。' },
    { shake: 0.3 },
    { facehoop: 7 },
    { music: { action: 'thud' } },
    { card: '照片里的脸，\n慢慢变成了一幅没绣完的缎面。' },
    { card: '五官都在——\n就是那根线，\n找不到针眼了。' },
    { bg: 'room', bgOpts: { evening: true } },
    { show: [{ char: 'xiuyun', expr: 'sad', pos: 'center' }] },
    { card: '她低下头，继续绣牡丹。\n一针。又一针。\n\n窗外，雨又下起来了。' },
    { clear: true },
    { goto: 'chapterEnd' }
  ];

  // ---------- 章节末：拆线与存档扰动 ----------
  const CHAPTER_END = [
    { card: '那一夜，堂屋里静得\n能听见线头落地的声音。' },
    { dissolve: 7.5 },
    { music: { action: 'motif', thin: 0.3 } },
    { card: '……' },
    { album: { corrupt: true } },
    { card: '记忆相册里，\n有两页，被悄悄拆过了。\n\n——你也开始怀疑，\n自己记下的东西了吗？' },
    { forget: 0.15 },
    { titlecard: { char: '夏', sub: '未完待续 · to be continued' } },
    { goto: 'outro' }
  ];

  // ---------- 尾声（数据落版） ----------
  function outro(game) {
    const steady = (game.stats.snaps <= 3);
    const beats = [
      { bg: 'black' },
      { card: '在中国，像沈绣云这样的\n阿尔茨海默病及相关痴呆患者——\n近 1700 万人。' },
      { card: '六十岁以上的轻度认知障碍老人，\n约 3877 万。\n其中，只有 14% 走进过医院。' },
      { card: '47% 的家人以为，\n那只是「年纪大了」。' }
    ];
    if (steady) {
      beats.push({ card: '至少此刻——\n线还在，手也还稳。' });
    } else {
      beats.push({ card: '有些线，一松手，\n就再也找不回来了。' });
    }
    beats.push(
      { card: '趁还记得——' },
      { card: '今晚，\n给家里打个电话。' },
      { card: '《绣忆》 Unfinished Dowry\n\n团队协作开发\n程序化水墨与刺绣渲染 · Web Audio 合成配乐\n\n谨以此作，献给所有\n正在遗忘、与正在被遗忘的人。' },
      { goto: 'title' }
    );
    return beats;
  }

  return {
    TITLES, PUZZLES, MEMORIES, CORRUPT_SPRING,
    PROLOGUE, CONTINUE_BEATS, HOTSPOTS, REQUIRED,
    DAUGHTER, NIGHT, CHAPTER_END, outro
  };
})();
