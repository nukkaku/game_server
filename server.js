const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = new Map();

io.on('connection', (socket) => {
  socket.on('room:create', ({ roomName, passcode, playerName, gameId }, ack) => {
    const cleanName = (roomName || '').trim();
    const cleanPass = (passcode || '').trim();
    if (!cleanName || !cleanPass) {
      return ack?.({ ok: false, message: 'ルーム名とあいことばを入力してください。' });
    }
    if (rooms.has(cleanName)) {
      return ack?.({ ok: false, message: '同じ名前のルームが既に存在します。' });
    }
    const player = { id: socket.id, name: playerName || 'ホスト', isHost: true };
    const room = {
      roomName: cleanName,
      passcode: cleanPass,
      selectedGameId: gameId || 'checkers',
      recruitmentClosed: false,
      players: [player]
    };
    rooms.set(cleanName, room);
    socket.join(cleanName);
    socket.data.roomName = cleanName;
    ack?.({ ok: true, selfId: socket.id, room });
    io.to(cleanName).emit('room:updated', room);
  });

  socket.on('room:join', ({ roomName, passcode, playerName }, ack) => {
    const cleanName = (roomName || '').trim();
    const cleanPass = (passcode || '').trim();
    const room = rooms.get(cleanName);
    if (!room) return ack?.({ ok: false, message: '指定されたルームが見つかりません。' });
    if (room.passcode !== cleanPass) return ack?.({ ok: false, message: 'あいことばが一致しません。' });
    if (room.players.length >= 2) return ack?.({ ok: false, message: 'このルームは満室です。' });

    const player = { id: socket.id, name: playerName || 'ゲスト', isHost: false };
    room.players.push(player);
    socket.join(cleanName);
    socket.data.roomName = cleanName;
    ack?.({ ok: true, selfId: socket.id, room });
    io.to(cleanName).emit('room:updated', room);
  });

  socket.on('lobby:close_recruitment', ({ roomName }, ack) => {
    const room = rooms.get(roomName);
    if (room) {
      room.recruitmentClosed = true;
      io.to(roomName).emit('lobby:recruitment_closed', { room });
      ack?.({ ok: true });
    }
  });

  socket.on('lobby:start_game', ({ roomName, gameId, players }) => {
    const room = rooms.get(roomName);
    if (room) {
      room.selectedGameId = gameId;
      io.to(roomName).emit('game:started', { room, gameId, players });
    }
  });

  socket.on('room:disband', ({ roomName }) => {
    rooms.delete(roomName);
    io.to(roomName).emit('room:disbanded');
  });

  socket.on('disconnect', () => {
    const roomName = socket.data.roomName;
    if (roomName && rooms.has(roomName)) {
      const room = rooms.get(roomName);
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(roomName);
      } else {
        room.players[0].isHost = true;
        io.to(roomName).emit('room:updated', room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});