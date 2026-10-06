# mods

Моды для Claude Code.

## token-meter

Счётчик расхода токенов в статус-строке. После каждого хода показывает:

```
turn: in 1.2k out 340 cached 18k | session: in 5k out 2k cached 60k | RU 85%
```

- `in` — новые входные токены (обычные + записанные в кэш)
- `out` — токены ответа
- `cached` — токены, прочитанные из кэша
- `RU` — доля кириллицы среди букв в последнем промпте

Субагенты не учитываются. Счётчик сбрасывается при перезагрузке мода.

### Установка

В терминальной сессии Claude Code:

```
/plugin install token-meter --marketplace almunkonst/mods
```

Ответь `y` на вопрос про добавление маркетплейса и выбери область (scope). Мод заработает сразу.

### Запуск из папки (для разработки)

```
git clone https://github.com/almunkonst/mods
claude --plugin-dir ./mods/token-meter
```

### Проверка

```
claude plugin validate token-meter
claude plugin test token-meter
```

## cache-keeper

Полоса над полем ввода: `cache warm 42m | ctx 111k (55%) | 5h 10% · week 59% | session $1.01`.

- Показывает, сколько ещё тёплый кэш, размер контекста, лимиты и расход.
- `H` (или `/handoff`): модель пишет записку о сессии, она сохраняется в `.cache-keeper/handoffs/`.
- `C` (или `/handoff continue`): очищает сессию (`/clear`) и продолжает по записке.
- Пункты «Pick up here» из записки становятся кнопками `1`–`3`: выбор очищает сессию и начинает с него.
- Подсказка «context is heavy» появляется, когда кэш остыл и контекст больше `warnPercent` окна, либо больше `urgentPercent` независимо от кэша.

Настройки: `ttlMinutes` (60), `warnPercent` (60), `urgentPercent` (80).

```
/plugin install cache-keeper --marketplace almunkonst/mods
```
