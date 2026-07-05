# Phase 9.7 Playtest Hotbar Notes

## Scope

Polish only the usability of the Phase 9.6 equipment/hotbar flow. Server authority, anti-cheat, class loadouts, combat balance, resource validation, building validation, capture/scoring, rally respawn, and round reset are unchanged.

## Observations before polish

- The hotbar sat too low (`bottom:18px`) and could share the same bottom lane as the joystick, sprint button, resource HUD, and mobile look hint.
- The equipped item label and interaction prompt were too close to the hotbar and could visually compete with action HUD text.
- Slot labels used long item display names, which were hard to read on a phone-sized viewport.
- Selected slot highlight was visible but not strong enough for fast play.
- Mobile sprint used the bottom lane and could overlap the hotbar on narrow screens.
- Old saved mobile layout positions could still be applied by `registerLayoutBtn`, risking old overlap even after the visible layout button was removed.
- Worker/Commander prompts were readable but longer than necessary.
- The first-person hand model mostly changed color; the item shape was not distinct enough.

## Final layout

- Hotbar: bottom center, raised above the screen edge (`bottom:56px`) and placed in its own dark translucent tray.
- Equipped label: centered above hotbar (`ถือ: ดาบ`, `ถือ: โล่`, `ถือ: ธนู`, `ถือ: ขวาน`, `ถือ: พลั่ว`, `ถือ: แปลนกำแพง`, `ถือ: ธงรวมพล`).
- Interaction prompt: above the equipped label to avoid fighting the hotbar.
- Resource HUD: moved above the joystick lane on the left.
- Action/stamina HUD: moved above the bottom controls on the right.
- Capture HUD: moved below the top control/minimap lane on mobile-sized screens so it does not collide with attack or minimap.
- Mobile sprint: moved to the right-side vertical controls under the secondary button, away from the hotbar.
- Mobile look hint: removed from the bottom lane so it does not compete with hotbar readability.
- Old saved layout positions are no longer applied to joystick/primary/sprint controls.

## Final desktop controls

- `1–5`: select hotbar slot.
- Mouse wheel: cycle through available class loadout slots.
- Left click: primary action of equipped item.
  - Sword/tool: melee attack.
  - Bow: bow attack.
  - Wall blueprint: place wall.
  - Rally blueprint: place rally flag.
- Right click/secondary:
  - Shield: hold block.
  - Bow: aim while held.
  - Blueprint: rotate/cancel placeholder hint.
- `E`: context action.
  - Worker + axe near tree: gather wood.
  - Worker + pickaxe near rock: gather stone.
  - Warehouse with carried resources: deposit.
- `H`: attack enemy building with equipped weapon.
- `V`: toggle camera.

## Final mobile controls

- Lower-left dynamic joystick: start dragging anywhere in the movement zone.
- Push the joystick strongly forward/up: sprint automatically; no separate sprint button.
- Upper-left `ยิง`: secondary fire button using the same primary action, placed below the status HUD.
- Lower-right `ยิง`: primary action of equipped item.
- Lower-right `เล็ง`: secondary action of equipped item.
- Lower-right `โดด`: explicit jump.
- Lower-right `ใช้`: contextual gather/deposit interaction.
- Upper-right `ย่อ/หมอบ/ยืน`: crouch/prone cycle.
- Bottom-center hotbar: tap slot to select item.

## Prompt rules

- Worker holding axe near tree: `E: เก็บไม้`.
- Worker holding pickaxe near rock: `E: เก็บหิน`.
- Worker with wrong tool: `ต้องถือขวาน` or `ต้องถือพลั่วขุดหิน`.
- Commander holding wall blueprint: `คลิก: วางกำแพง`.
- Commander holding rally blueprint: `คลิก: วางธงรวมพล`.
- Normal weapons show only concise attack/block/aim hints in the action HUD.

## Verification checklist

- Hotbar does not overlap joystick, sprint, attack, resource HUD, capture HUD, minimap, or prompts on a mobile-sized viewport.
- Selected item is obvious through a brighter selected slot and the `ถือ:` label.
- Slot labels are short/icon-like and fit in narrow screens.
- Desktop number keys and mouse wheel update selected item immediately.
- Mobile tap selection updates selected item immediately.
- First-person held model changes silhouette immediately for sword, shield, bow, axe, pickaxe, wall blueprint, and rally blueprint.
- Worker axe/pickaxe switching remains natural.
- Commander sword/wall/rally switching remains natural.
- Server-side authority remains unchanged.
