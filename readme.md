## dev
bash
```bash
export MPV_SCRIPT_DIR=/your_mpv_dir/portable_config/scripts && pnpm run dev
```

fish
```fish
set -x MPV_SCRIPT_DIR /your_mpv_dir/portable_config/scripts ; pnpm run dev
```

## Online Editor (StackBlitz)

You can write and build mpv scripts directly in your browser via StackBlitz — no local setup required.

1. Open the project in StackBlitz:

   [stackblitz](https://stackblitz.com/github/mpv-easy/mpv-easy-tpl)

2. Run the build command in the StackBlitz terminal:

   ```bash
   npm run build:osc
   ```

3. Download the generated `easy-react-tpl-osc.zip` file.

4. Extract the zip and place the scripts into your mpv scripts folder to use them.