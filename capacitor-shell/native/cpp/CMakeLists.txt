# ============================================================================
# AUBS Android shell — native build (Phase 2): libaubs_llama.so over llama.cpp
#
# AUBS — The Good Neighbor Guard · Truth · Safety · We Got Your Back
#
# Builds the JNI shim (aubs_llama.cpp) and links llama.cpp (vendored as a git submodule).
# CPU-first (NEON) for v1; Vulkan is OFF by default — flip AUBS_USE_VULKAN=ON only once it is
# proven faster/stable on a target device.
#
# Wire-up (in android/app/build.gradle, added after `npx cap add android` — see the P2 doc):
#   android { defaultConfig { externalNativeBuild { cmake { arguments "-DANDROID_STL=c++_shared" } } }
#            externalNativeBuild { cmake { path "src/main/cpp/CMakeLists.txt" } }
#            ndkVersion "26.3.11579264" }
# and vendor llama.cpp at android/app/src/main/cpp/llama.cpp (git submodule).
# ============================================================================
cmake_minimum_required(VERSION 3.22.1)
project(aubs_llama LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(AUBS_USE_VULKAN "Build llama.cpp with the Vulkan backend (off by default)" OFF)

# ── llama.cpp (vendored submodule) ───────────────────────────────────────────────────────
# Keep it lean for mobile: no tests, no examples, no server, no curl.
set(LLAMA_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER   OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL           OFF CACHE BOOL "" FORCE)
if(AUBS_USE_VULKAN)
    set(GGML_VULKAN ON CACHE BOOL "" FORCE)
endif()

add_subdirectory(llama.cpp)

# ── JNI shim ───────────────────────────────────────────────────────────────────────────────
add_library(aubs_llama SHARED aubs_llama.cpp)
target_link_libraries(aubs_llama llama ggml android log)
