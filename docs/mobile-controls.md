# Phase 9.8 Mobile Controls

## Scope

Phase 9.8 fixes the real mobile control scheme after Phase 9.7 hotbar polish. It does not add new gameplay systems and does not change server authority.

Preserved systems:

- Equipment/loadout snapshots and hotbar `selectItem`.
- Equipped item visuals.
- Infantry sword/shield.
- Archer bow.
- Worker axe/pickaxe gather.
- Commander wall/rally blueprint build.
- Faction resources.
- Rally Flag respawn.
- Central Fort capture, scoring, victory countdown, and round reset.
- Friendly fire prevention.
- Friendly building damage block.
- Enemy building damage.
- Resource node regen.
- Stamina, shield block, bow draw validation, and server authority.

## Final mobile layout

- Lower-left: dynamic floating movement joystick.
- Bottom-center: equipment hotbar.
- Lower-right: Fire / Aim / Jump / Action cluster.
- Upper-right: Crouch button, placed below the minimap and away from capture/score HUD.

## Movement

The movement joystick is now dynamic/floating:

- Start dragging from anywhere inside the lower-left movement zone.
- The joystick origin moves to the first touch position.
- Drag direction controls movement.
- Releasing the touch resets joystick to neutral.

## Sprint

There is no separate Sprint/วิ่ง button.

Sprint is automatic:

- Drag the movement joystick strongly forward/up to sprint.
- Sprint activates only when joystick Y is beyond the forward sprint threshold.
- Releasing or easing the joystick below threshold stops sprint.
- Stamina drain and sprint validation remain server-authoritative through the existing sprinting movement packet.

## Lower-right action cluster

- `ยิง`: uses the equipped item primary action.
  - Sword/tool: melee attack.
  - Bow: shot.
  - Blueprint: placement/confirm through the same primary flow.
- `เล็ง`: uses the equipped item secondary behavior.
  - Bow: aim while held.
  - Shield: block while held.
  - Blueprint/other: secondary hint only if relevant.
- `โดด`: explicit jump button; sets the existing mobile jump trigger.
- `ใช้`: contextual interaction button.
  - Worker + axe near tree: gather wood.
  - Worker + pickaxe near rock: gather stone.
  - Near own warehouse with carried resources: deposit.
  - Disabled/dim when no valid interaction exists.

## Upper-right crouch

- `ย่อ`: standing → crouch.
- `หมอบ`: crouch → prone.
- `ยืน`: prone → standing.

This uses the existing mobile crouch/prone movement and camera-height logic.

## Desktop remains unchanged

- `E`: contextual interaction.
- `Space`: jump.
- `Shift`: sprint.
- `Ctrl`: crouch.
- `C`: prone.
- `1–5`: hotbar select.
- Mouse wheel: cycle hotbar item.
- Left click: primary action.
- Right click: secondary action.

## Verification notes

Phase 9.8 adds `test_phase9_8_mobile_controls.mjs` for static mobile-control markers and 390x844 geometry checks.

Expected mobile geometry on 390x844:

- No visible overlap between joystick, hotbar, equipped label, prompts, resource HUD, action HUD, fire/aim/jump/action buttons, crouch, minimap, score HUD, and capture HUD.
- The invisible movement zone is allowed to cover the lower-left screen because it is lower z-index than visible controls and does not block the hotbar.
