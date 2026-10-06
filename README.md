# mods

Моды для Claude Code.

## cache-keeper

Полоса над полем ввода: `cache warm 42m | ctx 111k (55%) | 5h 10% · week 59% | session $1.01 | last in 1.2k out 340 cached 18k | RU 85%`.

- Показывает, сколько ещё тёплый кэш, размер контекста, лимиты и расход сессии.
- `last in/out/cached`: токены последнего хода (`in` = новые + записанные в кэш, `cached` = прочитанные из кэша), субагенты не считаются.
- `RU`: доля кириллицы среди букв в твоём последнем промпте.
- `H` (или `/handoff`): модель пишет записку о сессии, она сохраняется в `.cache-keeper/handoffs/`.
- `C` (или `/handoff continue`): очищает сессию (`/clear`) и продолжает по записке.
- Пункты «Pick up here» из записки становятся кнопками `1`–`3`: выбор очищает сессию и начинает с него.
- Подсказка «context is heavy» появляется, когда кэш остыл и контекст больше `warnPercent` окна, либо больше `urgentPercent` независимо от кэша.

Настройки: `ttlMinutes` (60), `warnPercent` (60), `urgentPercent` (80).

```
/plugin install cache-keeper --marketplace almunkonst/mods
```
