FROM nginx:1.31-alpine@sha256:fb4658584bd9a916ffb6f6e365f97c25cfdb2923801f551ea08356e695f14ff7

RUN apk add --no-cache certbot certbot-nginx openssl && \
    mkdir -p /var/www/certbot && \
    echo "0 0 * * * certbot renew --quiet && nginx -s reload" > /etc/crontabs/root

COPY default.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
