require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// === STEP 1: Render index with env vars ===
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  html = html
    .replace('<%= EPIC_CLIENT_ID %>', process.env.EPIC_CLIENT_ID)
    .replace('<%= REDIRECT_URI %>', process.env.REDIRECT_URI);
  res.send(html);
});

// === STEP 2: OAuth Callback ===
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send("No code.");

  try {
    // Exchange code for token
    const tokenRes = await axios.post(
      'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${process.env.EPIC_CLIENT_ID}:${process.env.EPIC_CLIENT_SECRET}`).toString('base64'),
        },
      }
    );

    const { access_token, account_id, displayName } = tokenRes.data;

    // Get locker
    const lockerRes = await axios.get('https://fortnite-api.com/v2/locker', {
      params: { accountId: account_id },
      headers: { Authorization: process.env.FORTNITE_API_KEY },
    });

    const locker = lockerRes.data.data;

    // === SEND TO DISCORD BOT VIA WEBHOOK (or DM) ===
    // We'll DM the bot itself (bot must be in a server with the user)
    // Or use a webhook to a private channel

    const botPayload = {
      content: `<@!${state.split('_')[0]}>`, // Optional: mention user if state has ID
      embeds: [{
        title: "Skin Check Verified!",
        description: `**${displayName}** just verified!`,
        color: 0x00ff00,
        fields: [
          { name: "Outfits", value: locker.outfits?.slice(0,3).map(i => i.name).join(', ') || "None", inline: false },
          { name: "Back Bling", value: locker.backpacks?.[0]?.name || "None", inline: true },
          { name: "Pickaxe", value: locker.pickaxes?.[0]?.name || "None", inline: true },
        ],
        timestamp: new Date().toISOString(),
      }]
    };

    // Option A: Send to Discord via bot token (DM or channel)
    await axios.post(
      `https://discord.com/api/v10/channels/YOUR_VERIFIED_CHANNEL_ID/messages`,
      botPayload,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    );

    // Option B: Or generate image here and upload (advanced)

    res.sendFile(path.join(__dirname, 'callback.html'));
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Verification failed. Try again.");
  }
});

app.listen(PORT, () => {
  console.log(`Verify site running on https://localhost:${PORT}`);
  console.log(`Use this URL: https://yourdomain.com`);
});
