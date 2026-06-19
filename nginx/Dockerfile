FROM nginx:1.27-alpine

RUN apk add --no-cache certbot certbot-nginx openssl && \
    mkdir -p /var/www/certbot && \
    echo "0 0 * * * certbot renew --quiet && nginx -s reload" > /etc/crontabs/root

COPY default.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]