FROM mcr.microsoft.com/powershell:7.4-ubuntu-22.04

RUN pwsh -NoLogo -NoProfile -Command \
    "Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; \
     Install-Module Az.Accounts -RequiredVersion 5.5.1 -Scope AllUsers -Force; \
     Install-Module Az.Storage -RequiredVersion 9.7.1 -Scope AllUsers -Force; \
     Install-Module Az.CosmosDB -RequiredVersion 1.21.0 -Scope AllUsers -Force; \
     Install-Module Mdbc -RequiredVersion 7.1.0 -Scope AllUsers -Force"

WORKDIR /app
COPY scripts ./scripts
COPY template-v3 ./template-v3

ENTRYPOINT ["pwsh", "-NoLogo", "-NoProfile", "-File", "/app/scripts/Invoke-RagProvisioning.ps1"]
