import 'dart:io';

import 'package:android_intent_plus/android_intent.dart';
import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/state/loading.dart';
import 'package:betterlectio/topics/welcome/bloc/login.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:webview_flutter/webview_flutter.dart';

class UniLoginScreen extends StatefulWidget {
  const UniLoginScreen({super.key});

  @override
  State<UniLoginScreen> createState() => _UniLoginScreenState();
}

class _UniLoginScreenState extends State<UniLoginScreen> {
  String? uniloginUrl;
  WebViewController? controller;
  String? currentUrl;
  @override
  void initState() {
    super.initState();

    setup();
  }

  Future<void> setup() async {
    var studentBloc = context.read<StudentBloc>();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (request) async {
          setState(() {
            currentUrl = request.url;
          });
          debugPrint("Current url is: ${request.url}");
          if (request.url.startsWith("https://appswitch.mitid.dk/") && Platform.isAndroid) {
           await  AndroidIntent(
              action: "action_view",
              data: request.url,
              flags: [268435456]
            ).launchChooser("Vælg app");
            return NavigationDecision.prevent;
          } else if (request.url
              .contains("lectio.dk/lectio/integration/unilogin.aspx")) {
            if (!request.url.contains('broker.unilogin.dk')) {
              context.read<StudentBloc>().add(UniloginEvent(request.url));
              debugPrint("lets copy this url and authenticate");
              return NavigationDecision.prevent;
            }
          }
          return NavigationDecision.navigate;
        },
      ));
    try {
      var bloc = context.read<LoginBloc>();
      var (url, cookies) = await Account(
              bloc.state.selectedGym, bloc.state.username, bloc.state.password)
          .getUniloginUrl();
      setState(() {
        uniloginUrl = url;
      });
      var cookieManager = WebViewCookieManager();
      for (var cookie in cookies) {
        cookieManager.setCookie(WebViewCookie(
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain ?? ""));
      }
      await controller?.loadRequest(Uri.parse(uniloginUrl ?? ""));

      setState(() {});
    } catch (e) {
      studentBloc.add(UniloginFailure());
    }
  }

  @override
  Widget build(BuildContext context) {
    if (uniloginUrl == null || controller == null) {
      return const LoadingScreen();
    }
    return Scaffold(
        appBar: BlAppbar(
          actions: [
            IconButton(
                onPressed: () {
                  context.read<StudentBloc>().add(CancelUnilogin());
                },
                icon: const Icon(EvaIcons.close))
          ],
          title: "",
          titleWidget: Text(currentUrl ?? "MitID Login"),
        ),
        body: WebViewWidget(controller: controller!));
  }
}
