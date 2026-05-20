import { hasSensorSupport, needsPermissionRequest, requestMotionPermission, getPermissionState } from '../shared/permissions.js';

const games = [
  {
    id: 'bowling',
    name: 'Bowling',
    description: 'Swing your phone to roll a strike! Tap the release button at just the right moment.',
    path: '/bowling/',
    icon: '\uD83C\uDFB3',
    status: 'playable',
  },
  {
    id: 'hexagon',
    name: 'HexSpin',
    description: 'Rotate your phone to dodge walls synced to the beat. How long can you survive?',
    path: '/hexagon/',
    icon: '\u2B21',
    status: 'playable',
  },
];

function renderGames() {
  const grid = document.getElementById('games-grid');
  grid.innerHTML = '';

  for (const game of games) {
    const card = document.createElement('a');
    card.className = 'game-card' + (game.status !== 'playable' ? ' disabled' : '');
    card.href = game.status === 'playable' ? game.path : '#';

    card.innerHTML = `
      <div class="game-icon">${game.icon}</div>
      <div class="game-info">
        <div class="game-name">${game.name}</div>
        <div class="game-desc">${game.description}</div>
        ${game.status === 'coming-soon'
          ? '<span class="game-badge soon">Coming Soon</span>'
          : '<span class="game-badge">Play Now</span>'}
      </div>
    `;

    grid.appendChild(card);
  }
}

function setupSensorBanner() {
  const banner = document.getElementById('sensor-banner');
  const message = document.getElementById('sensor-message');
  const btn = document.getElementById('enable-motion-btn');

  if (!hasSensorSupport()) {
    banner.classList.remove('hidden');
    message.textContent = 'Motion sensors not detected. These games are designed to be played on a phone — open this page on your mobile device!';
    return;
  }

  if (needsPermissionRequest()) {
    banner.classList.remove('hidden');
    message.textContent = 'This site uses your phone\'s motion sensors for gameplay. Tap the button below to enable them.';
    btn.classList.remove('hidden');

    btn.addEventListener('click', async () => {
      const granted = await requestMotionPermission();
      if (granted) {
        banner.classList.add('hidden');
      } else {
        message.textContent = 'Motion access was denied. Go to Settings > Safari > Motion & Orientation Access to enable it, then refresh.';
        btn.classList.add('hidden');
      }
    });
    return;
  }

  // Android / non-iOS: sensors available without permission
}

renderGames();
setupSensorBanner();
