#!/bin/bash

if [ -n "$BASH_SOURCE" ]; then
    SCRIPT_PATH="$BASH_SOURCE"
elif [ -n "$ZSH_VERSION" ]; then
    SCRIPT_PATH="${(%):-%x}"
else
    SCRIPT_PATH="$0"
fi
[ -z "$SCRIPT_PATH" ] && SCRIPT_PATH="$0"
if __dir="$(cd -- "$(dirname -- "$SCRIPT_PATH" 2>/dev/null)" && pwd -P 2>/dev/null)"; then
    SCRIPT_DIR="$__dir"
elif __dir="$(cd -- "$(dirname -- "$0")" && pwd -P 2>/dev/null)"; then
    SCRIPT_DIR="$__dir"
else
    SCRIPT_DIR="$(pwd -P 2>/dev/null || echo "/tmp")"
fi
ROOT_DIR="$(realpath "${SCRIPT_DIR}/../")"

arg_install_dir=""
arg_dist_dir="${ROOT_DIR}/dist"
arg_pack_env="runtime"
arg_root_dir="${ROOT_DIR}"

while [ $# -gt 0 ]; do
    case "$1" in
        --install-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2"
                arg_install_dir="$(realpath "$2")"
                shift 2
            else
                echo "Error: Invalid install dir."
                exit 1
            fi
            ;;
        --dist-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2"
                arg_dist_dir="$(realpath "$2")"
                shift 2
            else
                echo "Error: Invalid dist dir."
                exit 1
            fi
            ;;
        --pack-env)
            if [ -n "$2" ]; then
                arg_pack_env="$2"
                shift 2
            else
                echo "Error: Invalid pack env."
                exit 1
            fi
            ;;
        --root-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2"
                arg_root_dir="$(realpath "$2")"
                shift 2
            else
                echo "Error: Invalid root dir."
                exit 1
            fi
            ;;
        *)
            echo "Error: Unknown parameter $1"
            exit 1
            ;;
    esac
done

if [ -z "${arg_install_dir}" ]; then
    echo "Error: --install-dir is required"
    exit 1
fi

echo "install dir: ${arg_install_dir}"
echo "dist dir: ${arg_dist_dir}"
echo "pack env: ${arg_pack_env}"
echo "root dir: ${arg_root_dir}"

# initialize pixi environment
source "${SCRIPT_DIR}/pixi-init.sh" --root-dir "${arg_root_dir}"

# enter pixi root dir
echo "Enter pixi environment dir ${arg_root_dir}..."
cd "${arg_root_dir}" || { echo "Unable to enter directory: ${arg_root_dir}"; exit 1; }

# pack environment with retry
PIXI_UNPACK=$HOME/.pixi/bin/pixi-unpack-tool
echo "pixi pack ${arg_pack_env} environment..."
mkdir -p "${arg_dist_dir}"
RETRY=0
MAX_RETRY=5
while [ $RETRY -lt $MAX_RETRY ]; do
    if pixi-pack \
        --pixi-unpack-source "${PIXI_UNPACK}" \
        --environment ${arg_pack_env} \
        --create-executable \
        -o ${arg_dist_dir}/environment-${arg_pack_env}.sh \
        --use-cache ${arg_root_dir}/.pixi-pack/cache; then
        break
    fi
    RETRY=$((RETRY + 1))
    echo "[pack] pixi-pack failed (attempt $RETRY/$MAX_RETRY), retrying..."
    sleep 2
done
if [ $RETRY -ge $MAX_RETRY ]; then
    echo "[pack] pixi-pack failed after $MAX_RETRY attempts" >&2
    exit 1
fi

# copy environment scripts to install-dir
mkdir -p "${arg_install_dir}"
cp "${arg_dist_dir}/environment-${arg_pack_env}.sh" "${arg_install_dir}/environment.sh"
cp "${SCRIPT_DIR}/archive.sh" "${arg_install_dir}/archive.sh"
cp "${SCRIPT_DIR}/install.sh" "${arg_install_dir}/install.sh"
cp "${SCRIPT_DIR}/env-source.sh" "${arg_install_dir}/env-source.sh"
cp "${SCRIPT_DIR}/env-shell.sh" "${arg_install_dir}/env-shell.sh"
echo "copied environment scripts to ${arg_install_dir}"

# pack npm dependencies
workspace_pkg_json="${arg_root_dir}/src/ms_rcs/package.json"
if [ ! -f "${workspace_pkg_json}" ]; then
    echo "Error: package.json not found: ${workspace_pkg_json}"
    exit 1
fi

npm_tmp_dir=$(mktemp -d)
trap "rm -rf '${npm_tmp_dir}'" EXIT

npm_cache_dir="${arg_root_dir}/.npm-cache"
mkdir -p "${npm_cache_dir}"

echo "extracting npm dependencies from ${workspace_pkg_json}..."
pixi run node -e "
const pkg = require('${workspace_pkg_json}');
const out = {
    name: pkg.name || 'msrcs_deps',
    version: pkg.version || '0.1.0',
    private: true,
    dependencies: pkg.dependencies || {}
};
require('fs').writeFileSync('${npm_tmp_dir}/package.json', JSON.stringify(out, null, 2));
"

echo "installing npm dependencies..."
echo "dependencies: $(cat "${npm_tmp_dir}/package.json")"
(cd "${npm_tmp_dir}" && pixi run --manifest-path "${arg_root_dir}/pixi.toml" npm install --production --cache "${npm_cache_dir}" --prefer-offline)

npm_pack_file="${arg_install_dir}/msrcs_node_modules.tar.gz"
echo "packing node_modules to ${npm_pack_file}..."
tar -czf "${npm_pack_file}" -C "${npm_tmp_dir}" node_modules

echo "npm dependencies packed: ${npm_pack_file}"
echo "pack complete"
