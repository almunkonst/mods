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
