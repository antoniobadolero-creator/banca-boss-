const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// ── CONFIGURARE ────────────────────────────────
const COOLDOWN_SEC = 7000;   // durata totala cooldown
const WARN_SEC     = 1300;   // cat timp inainte sa anunte

const BANKS = [
  { value: 'highway',  name: '🛣️ Highway Bank'  },
  { value: 'alta',     name: '🏙️ Alta Bank'      },
  { value: 'winghood', name: '🦅 Winghood Bank'  },
  { value: 'desert',   name: '🏜️ Desert Bank'    },
];

const BANK_COLORS = {
  highway:  0x3498db,
  alta:     0x2ecc71,
  winghood: 0x9b59b6,
  desert:   0xe67e22,
};

const BANK_EMOJIS = {
  highway:  '🛣️',
  alta:     '🏙️',
  winghood: '🦅',
  desert:   '🏜️',
};

// Timere active in memorie
const activeTimers = {};

// ── HELPER: formateaza secundele ───────────────
function fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── SLASH COMMANDS ─────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('banca')
    .setDescription(`Porneste timerul pentru o banca (${fmt(COOLDOWN_SEC)} cooldown)`)
    .addStringOption(opt =>
      opt.setName('nume')
        .setDescription('Alege banca')
        .setRequired(true)
        .addChoices(...BANKS.map(b => ({ name: b.name, value: b.value })))
    ),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Vezi statusul tuturor bancilor active'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Opreste timerul unei banci')
    .addStringOption(opt =>
      opt.setName('nume')
        .setDescription('Alege banca')
        .setRequired(true)
        .addChoices(...BANKS.map(b => ({ name: b.name, value: b.value })))
    ),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    console.log('Inregistrez comenzile slash...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log('Comenzi inregistrate!');
  } catch (err) {
    console.error('Eroare comenzi:', err);
  }
}

// ── READY ──────────────────────────────────────
client.once('ready', async () => {
  console.log(`Bot pornit: ${client.user.tag}`);
  client.user.setActivity('🏦 FiveM Banks', { type: 3 });
  await registerCommands();
});

// ── INTERACTIONS ───────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  // /banca
  if (commandName === 'banca') {
    const bank     = interaction.options.getString('nume');
    const bankObj  = BANKS.find(b => b.value === bank);
    const emoji    = BANK_EMOJIS[bank];

    // Cauta canalul #banci
    const channel = interaction.guild.channels.cache.find(
      c => c.name === 'banci' && c.isTextBased()
    );
    if (!channel) {
      return interaction.reply({
        content: '❌ Nu am gasit canalul **#banci**! Creaza un canal cu numele exact `banci`.',
        ephemeral: true,
      });
    }

    // Sterge timer vechi daca exista
    if (activeTimers[bank]) {
      clearTimeout(activeTimers[bank].timerWarn);
      clearTimeout(activeTimers[bank].timerEnd);
    }

    const now     = Date.now();
    const endTime = now + COOLDOWN_SEC * 1000;
    const warnAt  = endTime - WARN_SEC * 1000;

    // Timer avertisment
    const msWarn = warnAt - Date.now();
    let timerWarn = null;
    if (msWarn > 0) {
      timerWarn = setTimeout(async () => {
        const embed = new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle(`⚠️ ${bankObj.name} — ${fmt(WARN_SEC)} RAMASE!`)
          .setDescription(`**${bankObj.name}** se va da in **${fmt(WARN_SEC)}**!\nPregatiti echipele! 🚔`)
          .addFields({ name: '⏰ Se da la ora', value: `<t:${Math.floor(endTime / 1000)}:T>`, inline: true })
          .setFooter({ text: 'FiveM Bank Timer' })
          .setTimestamp();
        await channel.send({ content: '@everyone', embeds: [embed] });
      }, msWarn);
    }

    // Timer final
    const timerEnd = setTimeout(async () => {
      const embed = new EmbedBuilder()
        .setColor(BANK_COLORS[bank])
        .setTitle(`💰 ${bankObj.name} — DISPONIBILA ACUM!`)
        .setDescription(`**${bankObj.name}** este disponibila!\nGrabiti-va! 🏎️💨`)
        .setFooter({ text: 'FiveM Bank Timer' })
        .setTimestamp();
      await channel.send({ content: '@everyone', embeds: [embed] });
      delete activeTimers[bank];
    }, endTime - Date.now());

    activeTimers[bank] = { endTime, timerWarn, timerEnd };

    // Confirmare
    const confirm = new EmbedBuilder()
      .setColor(BANK_COLORS[bank])
      .setTitle(`${emoji} Timer pornit — ${bankObj.name}`)
      .setDescription(`Cooldown: **${fmt(COOLDOWN_SEC)}**\nAlerta @everyone la: **${fmt(WARN_SEC)}** ramase`)
      .addFields(
        { name: '⏱️ Se da la', value: `<t:${Math.floor(endTime / 1000)}:T>`, inline: true },
        { name: '⚠️ Alerta la', value: `<t:${Math.floor(warnAt / 1000)}:T>`, inline: true },
      )
      .setFooter({ text: 'Alertele merg in #banci' })
      .setTimestamp();
    await interaction.reply({ embeds: [confirm] });
  }

  // /status
  else if (commandName === 'status') {
    const keys = Object.keys(activeTimers);
    if (keys.length === 0) {
      return interaction.reply({ content: '📭 Nicio banca activa momentan.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor(0x2c3e50)
      .setTitle('🏦 Status Banci Active')
      .setFooter({ text: 'FiveM Bank Timer' })
      .setTimestamp();
    for (const bank of keys) {
      const { endTime } = activeTimers[bank];
      const rem = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      const bankObj = BANKS.find(b => b.value === bank);
      embed.addFields({
        name: `${BANK_EMOJIS[bank]} ${bankObj.name}`,
        value: `⏳ Ramase: **${fmt(rem)}**\n🕐 Se da la: <t:${Math.floor(endTime / 1000)}:T>`,
        inline: false,
      });
    }
    await interaction.reply({ embeds: [embed] });
  }

  // /stop
  else if (commandName === 'stop') {
    const bank    = interaction.options.getString('nume');
    const bankObj = BANKS.find(b => b.value === bank);
    if (!activeTimers[bank]) {
      return interaction.reply({
        content: `❌ Nu exista niciun timer activ pentru **${bankObj.name}**.`,
        ephemeral: true,
      });
    }
    clearTimeout(activeTimers[bank].timerWarn);
    clearTimeout(activeTimers[bank].timerEnd);
    delete activeTimers[bank];
    await interaction.reply({ content: `🛑 Timerul pentru **${bankObj.name}** a fost oprit.` });
  }
});

client.login(process.env.TOKEN);
