FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /root

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    tmate \
    openssh-client \
    ca-certificates \
    sudo \
    htop \
    nano \
    net-tools \
    iputils-ping \
    neofetch \
    fastfetch || apt-get install -y neofetch && \
    rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
