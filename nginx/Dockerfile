FROM nginx:1.31-alpine@sha256:892bb2152464f0c5d8972593a5f5afaf8054552580b699d95f8ff4af08c2d33d

RUN apk add --no-cache certbot certbot-nginx openssl && \
    mkdir -p /var/www/certbot && \
    echo "0 0 * * * certbot renew --quiet && nginx -s reload" > /etc/crontabs/root

COPY default.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
