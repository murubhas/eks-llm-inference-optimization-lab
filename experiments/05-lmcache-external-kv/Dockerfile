ARG BASE_IMAGE=vllm/vllm-openai:v0.24.0-x86_64-cu129
FROM ${BASE_IMAGE}

ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64:/usr/local/lib/python3.12/dist-packages/nvidia/cuda_runtime/lib:/usr/local/lib/python3.12/dist-packages/nvidia/cublas/lib:/usr/local/lib/python3.12/dist-packages/nvidia/cudnn/lib:/usr/local/lib/python3.12/dist-packages/nvidia/nccl/lib:${LD_LIBRARY_PATH}

RUN python3 - <<'PY'
import ctypes
import importlib
import os

ctypes.CDLL("libcudart.so.12")

for module_name in [
    "vllm",
    "lmcache",
    "lmcache.integration.vllm.lmcache_mp_connector",
]:
    module = importlib.import_module(module_name)
    print(f"import ok: {module_name} {getattr(module, '__version__', '')}")

print("LD_LIBRARY_PATH=" + os.environ.get("LD_LIBRARY_PATH", ""))
PY
